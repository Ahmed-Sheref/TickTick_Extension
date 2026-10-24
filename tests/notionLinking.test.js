import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import User from "../Models/User.js";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import NotionLinkState from "../Models/NotionLinkState.js";
import { createNotionLinkService, notionIdentity } from "../services/notionLinkService.js";
import { createNotionCredentialService } from "../services/notionCredentials.js";
import { createNotionLinkRouter } from "../Routes/notionLinkRoute.js";
import { getNotionLinkConfig, getNotionLinkAuthUrl, exchangeNotionLinkCode,
    refreshNotionTokens } from "../utils/notionLinkOAuth.js";
import { decryptProviderToken } from "../utils/providerTokenEncryption.js";

const userId = "USER_existing_google";
const redirectUri = "https://test.chromiumapp.org/notion";
const callbackUri = "https://backend.example/api/v1/integrations/notion/callback";
const nonce = "n".repeat(43);
const uuid = digit => `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`;
const tokenResponse = (changes = {}) => ({ access_token: "private-notion-access", refresh_token: "private-notion-refresh",
    token_type: "bearer", workspace_id: uuid("a"), bot_id: uuid("b"), owner: { type: "user", user: { id: uuid("c") } },
    workspace_name: "Workspace", workspace_icon: null, ...changes });

function configure(t)
{
    const values = { NOTION_CLIENT_ID: "notion-client", NOTION_CLIENT_SECRET: "private-client-secret",
        NOTION_REDIRECT_URI: callbackUri, NOTION_API_VERSION: "2026-03-11",
        PROVIDER_TOKEN_ACTIVE_KEY_ID: "k1", PROVIDER_TOKEN_KEYS: JSON.stringify({ k1: randomBytes(32).toString("hex") }),
        ALLOWED_EXTENSION_REDIRECT_URIS: redirectUri, JWT_SECRET: "test-jwt-secret" };
    for (const [key, value] of Object.entries(values))
    {
        const before = process.env[key];
        process.env[key] = value;
        t.after(() =>
        {
            if (before === undefined)
            {
                delete process.env[key];
            }
            else
            {
                process.env[key] = before;
            }
        });
    }
}

function fixture(t, { accounts = new Map(), google = true, userExists = true, forceMiss = false } = {})
{
    configure(t);
    const states = new Map();
    const writes = [];
    let record;
    let tokens = tokenResponse();
    let writeFails = false;
    let nextId = 0;
    const matches = (account, query) => Object.entries(query).every(([key, value]) =>
        value === null ? account[key] == null : account[key] === value);
    const StateModel = {
        create: async value => { record = value; states.set(value.stateHash, value); },
        findOneAndDelete: async query =>
        {
            const attempt = states.get(query.stateHash);
            if (!attempt || attempt.expiresAt <= query.expiresAt.$gt)
            {
                return null;
            }
            states.delete(query.stateHash);
            return attempt;
        }
    };
    const ConnectedAccountModel = {
        findOne: async query => forceMiss ? null : [...accounts.values()].find(value => matches(value, query)) || null,
        findOneAndUpdate: (query, update, options = {}) =>
        {
            const run = async () =>
            {
                assert.equal(query.provider, "notion");
                if (writeFails)
                {
                    throw new Error("private database failure");
                }
                const current = [...accounts.values()].find(value => matches(value, query));
                if (!current && !options.upsert)
                {
                    return null;
                }
                const next = structuredClone(current || { ...update.$setOnInsert, _id: `id-${++nextId}`, createdAt: new Date() });
                for (const [key, value] of Object.entries(update.$set))
                {
                    if (key.startsWith("metadata."))
                    {
                        next.metadata[key.slice(9)] = value;
                    }
                    else
                    {
                        next[key] = value;
                    }
                }
                const conflict = [...accounts.values()].some(value => value.provider === "notion" &&
                    value._id !== current?._id && (value.userId === next.userId || value.providerAccountId === next.providerAccountId));
                if (conflict)
                {
                    throw Object.assign(new Error("duplicate"), { code: 11000 });
                }
                await new ConnectedAccount({ ...next, _id: undefined }).validate();
                // Recheck after yielding to simulate MongoDB's atomic index arbitration.
                const raced = [...accounts.values()].some(value => value.provider === "notion" &&
                    value._id !== current?._id && (value.userId === next.userId || value.providerAccountId === next.providerAccountId));
                if (raced)
                {
                    throw Object.assign(new Error("duplicate"), { code: 11000 });
                }
                accounts.set(`${next.userId}:notion`, next);
                writes.push({ query, update, options });
                return structuredClone(next);
            };
            // Mongoose Query is thenable and supports select before execution.
            return { then: (resolve, reject) => run().then(resolve, reject), select: () => run() };
        }
    };
    const dependencies = { UserModel: { exists: async () => userExists }, AuthIdentityModel: { exists: async () => google },
        StateModel, ConnectedAccountModel };
    const exchangeCode = t.mock.fn(async () => structuredClone(tokens));
    const service = createNotionLinkService({ ...dependencies, exchangeCode });
    return { service, accounts, writes, dependencies, exchangeCode,
        get record() { return record; }, get account() { return accounts.get(`${userId}:notion`); },
        setTokens(value) { tokens = value; }, failWrites(value) { writeFails = value; },
        async start(id = userId)
        {
            const result = await service.startLink({ userId: id, redirectUri, clientNonce: nonce });
            return new URL(result.authorizationUrl).searchParams.get("state");
        },
        async connect(id = userId)
        {
            return service.completeLink({ state: await this.start(id), code: "authorization-code" });
        } };
}

function invoke(router, { method = "GET", path = "/callback", query = {}, body = {}, token } = {})
{
    return new Promise((resolve, reject) =>
    {
        const req = { method, url: path, query, body, headers: token ? { authorization: `Bearer ${token}` } : {} };
        const headers = {};
        const res = {
            statusCode: 200,
            set(name, value) { headers[name] = value; return this; },
            status(value) { this.statusCode = value; return this; },
            json(data) { resolve({ statusCode: this.statusCode, data, headers }); return this; },
            redirect(url) { resolve({ statusCode: 302, url, headers }); return this; }
        };
        router(req, res, error => reject(error || new Error("Route not matched")));
    });
}

test("authenticated Google user links without creating User/JWT; tokens use existing authenticated encryption", async t =>
{
    const f = fixture(t);
    const create = t.mock.method(User, "create", async () => { throw new Error("forbidden"); });
    const sign = t.mock.method(jwt, "sign", () => { throw new Error("forbidden"); });
    const ticktick = { userId, provider: "ticktick", encryptedAccessToken: "existing-ticktick", metadata: { selectedProjectId: "old" } };
    f.accounts.set(`${userId}:ticktick`, structuredClone(ticktick));
    const result = await f.connect();
    assert.equal(f.accounts.size, 2);
    assert.equal(f.account.userId, userId);
    assert.equal(f.account.providerAccountId, notionIdentity(tokenResponse()));
    assert.equal(f.account.connected, true);
    assert.equal(f.account.tokenKeyId, "k1");
    assert.ok(f.account.tokenEncryptedAt instanceof Date);
    for (const type of ["access", "refresh"])
    {
        const encrypted = f.account[type === "access" ? "encryptedAccessToken" : "encryptedRefreshToken"];
        assert.equal(decryptProviderToken(encrypted, { userId, provider: "notion", tokenType: type }), tokenResponse()[`${type}_token`]);
        assert.throws(() => decryptProviderToken(encrypted, { userId, provider: "ticktick", tokenType: type }));
    }
    assert.deepEqual(f.accounts.get(`${userId}:ticktick`), ticktick);
    assert.equal(create.mock.callCount(), 0);
    assert.equal(sign.mock.callCount(), 0);
    const url = new URL(result.redirectUrl);
    assert.deepEqual([...url.searchParams], [["notion_link", "connected"], ["client_nonce", nonce]]);
    assert.deepEqual(f.exchangeCode.mock.calls[0].arguments, ["authorization-code", callbackUri]);
    assert.ok(!JSON.stringify(result).includes(userId));
});

test("link/status require existing JWT, use req.user.userId and ignore client ownership claims", async t =>
{
    const f = fixture(t);
    t.mock.method(User, "findOne", async query =>
    {
        assert.deepEqual(query, { userId });
        return { userId, _id: { toString: () => "mongo-id" } };
    });
    const router = createNotionLinkRouter({ service: f.service });
    const body = { redirect_uri: redirectUri, client_nonce: nonce, userId: "attacker" };
    assert.equal((await invoke(router, { method: "POST", path: "/link", body })).statusCode, 401);
    assert.equal((await invoke(router, { path: "/status" })).statusCode, 401);
    assert.equal((await invoke(router, { method: "POST", path: "/link", body, token: "invalid" })).statusCode, 401);
    const token = jwt.sign({ userId }, process.env.JWT_SECRET);
    const result = await invoke(router, { method: "POST", path: "/link", body, token });
    assert.equal(result.statusCode, 200);
    assert.equal(f.record.userId, userId);
    assert.equal(jwt.verify(token, process.env.JWT_SECRET).userId, userId);
});

test("Google identity required at initiation and completion; deleted users rejected", async t =>
{
    const f = fixture(t, { google: false });
    await assert.rejects(f.start(), { code: "GOOGLE_IDENTITY_REQUIRED" });
    const gone = fixture(t, { userExists: false });
    await assert.rejects(gone.connect(), { code: "LINK_USER_NOT_FOUND" });
    const normal = fixture(t);
    const state = await normal.start();
    normal.dependencies.AuthIdentityModel.exists = async () => false;
    await assert.rejects(normal.service.completeLink({ state, code: "code" }), { code: "GOOGLE_IDENTITY_REQUIRED" });
});

for (const uri of ["https://evil.example/notion", "http://test.chromiumapp.org/notion", "javascript:alert(1)",
    "https://user:pass@test.chromiumapp.org/notion", `${redirectUri}?next=evil`, `${redirectUri}#fragment`,
    "https://test.chromiumapp.org.evil.example/notion", "not-a-url"])
{
    test(`reject unsafe redirect even if allowlisted: ${uri}`, async t =>
    {
        const f = fixture(t);
        process.env.ALLOWED_EXTENSION_REDIRECT_URIS = uri;
        await assert.rejects(f.service.startLink({ userId, redirectUri: uri, clientNonce: nonce }), { code: "INVALID_LINK_PARAMETERS" });
    });
}

test("unapproved URI, malformed nonce, changed allowlist fail before exchange", async t =>
{
    const f = fixture(t);
    await assert.rejects(f.service.startLink({ userId, redirectUri: "https://other.chromiumapp.org/notion", clientNonce: nonce }));
    for (const clientNonce of [undefined, "short", [], "?".repeat(43), "x".repeat(129)])
    {
        await assert.rejects(f.service.startLink({ userId, redirectUri, clientNonce }), { code: "INVALID_LINK_PARAMETERS" });
    }
    const state = await f.start();
    process.env.ALLOWED_EXTENSION_REDIRECT_URIS = "";
    await assert.rejects(f.service.completeLink({ state, code: "code" }), { code: "INVALID_LINK_PARAMETERS" });
    assert.equal(f.exchangeCode.mock.callCount(), 0);
});

test("256-bit state is random, stored hashed, expires in ten minutes and has unique/TTL indexes", async t =>
{
    const f = fixture(t);
    const first = await f.start();
    const second = await f.start();
    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first, second);
    assert.equal(f.record.stateHash, createHash("sha256").update(second).digest("hex"));
    assert.ok(!JSON.stringify(f.record).includes(second));
    assert.equal(f.record.providerRedirectUri, callbackUri);
    assert.equal(f.record.clientNonce, nonce);
    assert.ok(f.record.expiresAt > new Date(Date.now() + 590000));
    assert.ok(f.record.expiresAt <= new Date(Date.now() + 600000));
    assert.ok(NotionLinkState.schema.indexes().some(([key, options]) => key.stateHash === 1 && options.unique));
    assert.ok(NotionLinkState.schema.indexes().some(([key, options]) => key.expiresAt === 1 && options.expireAfterSeconds === 0));
    assert.equal(ConnectedAccount.schema.path("notionRefreshLock").options.select, false);
});

test("expired, malformed, missing, replayed and concurrently consumed states never exchange twice", async t =>
{
    const f = fixture(t);
    for (const state of [undefined, [], "bad", "x".repeat(43)])
    {
        await assert.rejects(f.service.completeLink({ state, code: "code" }), { code: "INVALID_LINK_STATE" });
    }
    const expired = await f.start();
    f.record.expiresAt = new Date(Date.now() - 1);
    await assert.rejects(f.service.completeLink({ state: expired, code: "code" }), { code: "INVALID_LINK_STATE" });
    assert.equal(f.exchangeCode.mock.callCount(), 0);
    const state = await f.start();
    const results = await Promise.allSettled([f.service.completeLink({ state, code: "code" }), f.service.completeLink({ state, code: "code" })]);
    assert.equal(results.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(f.exchangeCode.mock.callCount(), 1);
    await assert.rejects(f.service.completeLink({ state, code: "code" }), { code: "INVALID_LINK_STATE" });
});

test("cancelled and malformed callbacks consume state, sanitize provider details, never redirect", async t =>
{
    const f = fixture(t);
    const router = createNotionLinkRouter({ service: f.service });
    for (const query of [{ error: "access_denied private-notion-access" }, { code: [] }, { code: "" }, { error: "", code: "code" }])
    {
        const state = await f.start();
        const response = await invoke(router, { query: { state, ...query } });
        assert.equal(response.statusCode, 400);
        assert.equal(response.url, undefined);
        assert.ok(!JSON.stringify(response).includes("private-notion"));
        await assert.rejects(f.service.completeLink({ state, code: "code" }), { code: "INVALID_LINK_STATE" });
    }
    assert.equal(f.exchangeCode.mock.callCount(), 0);
});

test("reconnect replaces both encrypted tokens and destination on the same account", async t =>
{
    const f = fixture(t);
    await f.connect();
    const previous = structuredClone(f.account);
    f.setTokens(tokenResponse({ access_token: "new-access", refresh_token: "new-refresh", workspace_id: uuid("d"), bot_id: uuid("e") }));
    await f.connect();
    assert.equal(f.accounts.size, 1);
    assert.equal(f.account._id, previous._id);
    assert.deepEqual(f.account.createdAt, previous.createdAt);
    assert.equal(f.account.metadata.workspaceId, uuid("d"));
    assert.notEqual(f.account.providerAccountId, previous.providerAccountId);
    assert.notEqual(f.account.encryptedAccessToken, previous.encryptedAccessToken);
    assert.notEqual(f.account.encryptedRefreshToken, previous.encryptedRefreshToken);
});

test("different authorizing users in one workspace are independent; exact identity conflicts preserve old connection", async t =>
{
    const f = fixture(t);
    await f.connect();
    f.setTokens(tokenResponse({ owner: { type: "user", user: { id: uuid("d") } } }));
    await f.connect("USER_second");
    assert.equal(f.accounts.size, 2);
    const previous = structuredClone(f.account);
    await assert.rejects(f.connect(), { code: "NOTION_ACCOUNT_CONFLICT" });
    assert.deepEqual(f.account, previous);
});

test("atomic indexes arbitrate simultaneous identity claims even when advisory checks miss", async t =>
{
    const f = fixture(t, { forceMiss: true });
    const results = await Promise.allSettled([f.connect(), f.connect("USER_other")]);
    assert.equal(results.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(results.find(value => value.status === "rejected").reason.code, "NOTION_ACCOUNT_CONFLICT");
    assert.equal(f.accounts.size, 1);
});

test("same-user simultaneous first links cannot create duplicate rows", async t =>
{
    const f = fixture(t, { forceMiss: true });
    const results = await Promise.allSettled([f.connect(), f.connect()]);
    assert.equal(results.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(f.accounts.size, 1);
});

test("malformed identity/token, encryption configuration and write failures preserve previous credentials", async t =>
{
    const f = fixture(t);
    await f.connect();
    const previous = structuredClone(f.account);
    for (const changes of [{ access_token: "" }, { refresh_token: null }, { workspace_id: "guessed" },
        { owner: { type: "workspace" } }, { bot_id: null }, { token_type: "other" }])
    {
        f.setTokens(tokenResponse(changes));
        await assert.rejects(f.connect(), { code: "NOTION_OAUTH_FAILED" });
        assert.deepEqual(f.account, previous);
    }
    f.setTokens(tokenResponse());
    const state = await f.start();
    const keys = process.env.PROVIDER_TOKEN_KEYS;
    process.env.PROVIDER_TOKEN_KEYS = "invalid";
    await assert.rejects(f.service.completeLink({ state, code: "code" }), { code: "TOKEN_ENCRYPTION_UNAVAILABLE" });
    assert.deepEqual(f.account, previous);
    process.env.PROVIDER_TOKEN_KEYS = keys;
    f.failWrites(true);
    await assert.rejects(f.connect());
    assert.deepEqual(f.account, previous);
});

test("callback and authenticated status return only safe information and security headers", async t =>
{
    const f = fixture(t);
    const router = createNotionLinkRouter({ service: f.service,
        authenticate: (req, res, next) => { req.user = { userId }; next(); } });
    const callback = await invoke(router, { query: { state: await f.start(), code: "code" } });
    const status = await invoke(router, { path: "/status" });
    assert.equal(callback.statusCode, 302);
    assert.deepEqual(Object.keys(status.data.data).sort(), ["connected", "reconnectRequired", "workspaceIcon", "workspaceName"]);
    for (const result of [callback, status])
    {
        assert.equal(result.headers["Cache-Control"], "no-store");
        assert.equal(result.headers["Referrer-Policy"], "no-referrer");
        const output = JSON.stringify(result);
        for (const secret of [tokenResponse().access_token, tokenResponse().refresh_token,
            process.env.NOTION_CLIENT_SECRET, f.account.encryptedAccessToken, userId])
        {
            assert.ok(!output.includes(secret));
        }
    }
    const failing = createNotionLinkRouter({ service: { completeLink: async () => { throw new Error("private-secret"); } } });
    const error = await invoke(failing);
    assert.equal(error.statusCode, 500);
    assert.ok(!JSON.stringify(error).includes("private-secret"));
});

test("encryption failure after provider exchange leaves the previous link intact", async t =>
{
    const f = fixture(t);
    await f.connect();
    const previous = structuredClone(f.account);
    const exchangeCode = async () =>
    {
        process.env.PROVIDER_TOKEN_KEYS = "invalid";
        return tokenResponse();
    };
    const service = createNotionLinkService({ ...f.dependencies, exchangeCode });
    const state = new URL((await service.startLink({ userId, redirectUri, clientNonce: nonce })).authorizationUrl).searchParams.get("state");
    await assert.rejects(service.completeLink({ state, code: "code" }), { code: "TOKEN_ENCRYPTION_UNAVAILABLE" });
    assert.deepEqual(f.account, previous);
});

test("OAuth request uses documented fixed HTTPS endpoints, Basic auth, JSON, version and exact redirect", async t =>
{
    configure(t);
    const auth = new URL(getNotionLinkAuthUrl("s".repeat(43), callbackUri));
    assert.equal(auth.origin + auth.pathname, "https://api.notion.com/v1/oauth/authorize");
    assert.deepEqual(Object.fromEntries(auth.searchParams), { client_id: "notion-client", response_type: "code",
        owner: "user", redirect_uri: callbackUri, state: "s".repeat(43) });
    const fetchMock = t.mock.method(globalThis, "fetch", async (url, options) =>
    {
        assert.equal(url, "https://api.notion.com/v1/oauth/token");
        assert.equal(options.redirect, "error");
        assert.ok(options.signal instanceof AbortSignal);
        assert.equal(options.headers["Notion-Version"], "2026-03-11");
        assert.equal(options.headers["Content-Type"], "application/json");
        assert.equal(options.headers.Authorization, `Basic ${Buffer.from("notion-client:private-client-secret").toString("base64")}`);
        return Response.json(tokenResponse());
    });
    await exchangeNotionLinkCode("code", callbackUri);
    assert.deepEqual(JSON.parse(fetchMock.mock.calls[0].arguments[1].body), { grant_type: "authorization_code", code: "code", redirect_uri: callbackUri });
    await refreshNotionTokens("refresh");
    assert.deepEqual(JSON.parse(fetchMock.mock.calls[1].arguments[1].body), { grant_type: "refresh_token", refresh_token: "refresh" });
    await assert.rejects(exchangeNotionLinkCode("code", "https://changed.example/callback"), { code: "NOTION_LINK_UNAVAILABLE" });
});

test("configuration fails closed for absent secrets, unsupported version and unsafe callback", t =>
{
    configure(t);
    for (const [key, value] of [["NOTION_CLIENT_ID", ""], ["NOTION_CLIENT_SECRET", ""], ["NOTION_API_VERSION", ""],
        ["NOTION_API_VERSION", "2099-01-01"], ["NOTION_REDIRECT_URI", "http://localhost/callback"],
        ["NOTION_REDIRECT_URI", "https://user:pass@example.com/callback"], ["NOTION_REDIRECT_URI", "https://example.com/callback?x=1"]])
    {
        const before = process.env[key];
        process.env[key] = value;
        assert.throws(getNotionLinkConfig, { code: "NOTION_LINK_UNAVAILABLE" });
        process.env[key] = before;
    }
});

for (const scenario of ["http", "redirect", "bad-json", "wrong-type", "huge", "missing-access", "missing-owner", "transport"])
{
    test(`OAuth exchange rejects ${scenario} with sanitized error`, async t =>
    {
        configure(t);
        t.mock.method(globalThis, "fetch", async () =>
        {
            if (scenario === "transport")
            {
                throw new Error("private-notion-access private-client-secret");
            }
            if (scenario === "http" || scenario === "redirect")
            {
                return new Response("private-client-secret", { status: scenario === "http" ? 401 : 302 });
            }
            if (scenario === "bad-json" || scenario === "huge" || scenario === "wrong-type")
            {
                return new Response(scenario === "huge" ? "x".repeat(65537) : "not-json",
                    { headers: { "content-type": scenario === "wrong-type" ? "text/html" : "application/json" } });
            }
            return Response.json(tokenResponse(scenario === "missing-access" ? { access_token: null } : { owner: null }));
        });
        await assert.rejects(exchangeNotionLinkCode("code", callbackUri), error =>
        {
            assert.equal(error.code, "NOTION_OAUTH_FAILED");
            assert.ok(!error.message.includes("private"));
            return true;
        });
    });
}

test("refresh rotates both tokens in one write and never returns them", async t =>
{
    const f = fixture(t);
    await f.connect();
    const old = structuredClone(f.account);
    const refreshTokens = t.mock.fn(async token =>
    {
        assert.equal(token, tokenResponse().refresh_token);
        return tokenResponse({ access_token: "rotated-access", refresh_token: "rotated-refresh" });
    });
    const credentials = createNotionCredentialService({ ...f.dependencies, refreshTokens });
    assert.deepEqual(await credentials.refreshForUser({ userId }), { connected: true });
    assert.equal(f.account.notionRefreshLock, null);
    assert.notEqual(f.account.encryptedAccessToken, old.encryptedAccessToken);
    assert.notEqual(f.account.encryptedRefreshToken, old.encryptedRefreshToken);
    assert.equal(f.account.providerAccountId, old.providerAccountId);
    assert.equal(decryptProviderToken(f.account.encryptedRefreshToken, { userId, provider: "notion", tokenType: "refresh" }), "rotated-refresh");
    const write = f.writes.at(-1);
    assert.ok(write.query.notionRefreshLock);
    assert.ok(write.update.$set.encryptedAccessToken && write.update.$set.encryptedRefreshToken);
});

test("concurrent refreshes serialize across service instances; reconnect supersedes old response", async t =>
{
    const f = fixture(t);
    await f.connect();
    let finish;
    let signalStarted;
    const started = new Promise(resolve => { signalStarted = resolve; });
    const refreshTokens = t.mock.fn(async () =>
    {
        signalStarted();
        return new Promise(resolve => { finish = resolve; });
    });
    const one = createNotionCredentialService({ ...f.dependencies, refreshTokens });
    const two = createNotionCredentialService({ ...f.dependencies, refreshTokens });
    const pending = one.refreshForUser({ userId });
    await started;
    await assert.rejects(two.refreshForUser({ userId }), { code: "NOTION_REFRESH_UNAVAILABLE" });
    f.setTokens(tokenResponse({ access_token: "new-reconnect", refresh_token: "new-reconnect-refresh", workspace_id: uuid("d") }));
    await f.connect();
    const current = structuredClone(f.account);
    finish(tokenResponse({ access_token: "stale-access", refresh_token: "stale-refresh" }));
    await assert.rejects(pending, { code: "NOTION_REFRESH_SUPERSEDED" });
    assert.deepEqual(f.account, current);
    assert.equal(refreshTokens.mock.callCount(), 1);
});

for (const mode of ["revoked", "malformed", "identity-switch", "decryption", "encryption", "persistence"])
{
    test(`refresh ${mode} fails closed without partial token replacement; reconnect recovers`, async t =>
    {
        const f = fixture(t);
        await f.connect();
        const old = structuredClone(f.account);
        const keys = process.env.PROVIDER_TOKEN_KEYS;
        if (mode === "decryption")
        {
            f.account.encryptedRefreshToken = "tampered";
        }
        const credentials = createNotionCredentialService({ ...f.dependencies, refreshTokens: async () =>
        {
            if (mode === "revoked")
            {
                throw new Error("private-provider-error");
            }
            if (mode === "persistence")
            {
                f.failWrites(true);
            }
            if (mode === "encryption")
            {
                process.env.PROVIDER_TOKEN_KEYS = "invalid";
            }
            return tokenResponse(mode === "malformed" ? { refresh_token: null } :
                mode === "identity-switch" ? { workspace_id: uuid("d") } : { access_token: "rotated" });
        } });
        await assert.rejects(credentials.refreshForUser({ userId }), { code: "NOTION_RECONNECT_REQUIRED" });
        assert.equal(f.account.encryptedAccessToken, old.encryptedAccessToken);
        if (mode !== "decryption")
        {
            assert.equal(f.account.encryptedRefreshToken, old.encryptedRefreshToken);
        }
        assert.ok(f.account.notionRefreshLock);
        if (mode !== "persistence")
        {
            assert.equal(f.account.connected, false);
            assert.equal(f.account.metadata.reconnectRequired, true);
        }
        f.failWrites(false);
        process.env.PROVIDER_TOKEN_KEYS = keys;
        await assert.rejects(credentials.refreshForUser({ userId }), { code: "NOTION_REFRESH_UNAVAILABLE" });
        await f.connect();
        assert.equal(f.account.connected, true);
        assert.equal(f.account.notionRefreshLock, null);
    });
}

test("refresh rejects non-owning/missing users and handles token-only response without fabricating identity", async t =>
{
    const f = fixture(t);
    await f.connect();
    const refreshTokens = t.mock.fn(async () => ({ token_type: "bearer", access_token: "new", refresh_token: "new-refresh" }));
    const credentials = createNotionCredentialService({ ...f.dependencies, refreshTokens });
    await assert.rejects(credentials.refreshForUser({ userId: "USER_other" }), { code: "NOTION_REFRESH_UNAVAILABLE" });
    await assert.rejects(credentials.refreshForUser({ userId: null }), { code: "GOOGLE_IDENTITY_REQUIRED" });
    assert.equal(refreshTokens.mock.callCount(), 0);
    const identity = f.account.providerAccountId;
    await credentials.refreshForUser({ userId });
    assert.equal(f.account.providerAccountId, identity);
});
