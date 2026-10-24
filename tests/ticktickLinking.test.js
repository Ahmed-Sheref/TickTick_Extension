import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import axios from "axios";
import User from "../Models/User.js";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import OAuthState from "../Models/OAuthState.js";
import OAuthExchange from "../Models/OAuthExchange.js";
import TickTickLinkState from "../Models/TickTickLinkState.js";
import { createTickTickLinkService } from "../services/ticktickLinkService.js";
import { createTickTickLinkRouter } from "../Routes/ticktickLinkRoute.js";
import legacyRouter from "../Routes/ticktickRoute.js";
import { decryptProviderToken, encryptProviderToken } from "../utils/providerTokenEncryption.js";
import { fingerprintTickTickCredential } from "../utils/ticktickCredentialFingerprint.js";
import { getTickTickAccessToken } from "../services/ticktickCredentials.js";
import { getTickTickLinkAuthUrl, exchangeTickTickLinkCode } from "../utils/ticktickLinkOAuth.js";

const userId = "USER_google_existing";
const redirectUri = "https://test.chromiumapp.org/ticktick";
const callbackUri = "http://localhost:3000/api/v1/integrations/ticktick/callback";
const nonce = "n".repeat(43);
const access = "private-new-access-token";
const refresh = "private-new-refresh-token";
const encryptionKey = randomBytes(32).toString("hex");
const fingerprintKey = randomBytes(32).toString("hex");

const configure = (t) =>
{
    const values = {
        PROVIDER_TOKEN_KEYS: JSON.stringify({ k1: encryptionKey }),
        PROVIDER_TOKEN_ACTIVE_KEY_ID: "k1", TICKTICK_CLIENT_ID: "test-client",
        TICKTICK_CREDENTIAL_FINGERPRINT_KEY: fingerprintKey,
        TICKTICK_CLIENT_SECRET: "test-client-secret", TICKTICK_LINK_REDIRECT_URI: callbackUri,
        TICKTICK_LINK_CLIENT_ID: "", TICKTICK_LINK_CLIENT_SECRET: "",
        TICKTICK_REDIRECT_URI: "http://localhost:3000/api/v1/ticktick/callback",
        ALLOWED_EXTENSION_REDIRECT_URIS: redirectUri, JWT_SECRET: "test-jwt-secret"
    };
    const before = {};
    for (const [key, value] of Object.entries(values))
    {
        before[key] = process.env[key];
        process.env[key] = value;
    }
    t.after(() =>
    {
        for (const key of Object.keys(values))
        {
            if (before[key] === undefined)
            {
                delete process.env[key];
            }
            else
            {
                process.env[key] = before[key];
            }
        }
    });
};

function fixture(t, { appUserId = userId, accounts = new Map(), userExists = true,
    google = true, duplicate = false, writeFails = false, lookupFails = false,
    forcePrecheckMiss = false, legacy = false } = {})
{
    configure(t);
    const states = new Map();
    let stateRecord;
    let tokens = { access_token: access, refresh_token: refresh };
    const writes = [];
    const operations = [];
    let insertions = 0;
    const legacyUsers = legacy ? [{ userId: "USER_legacy", tickTickConnected: true,
        tickTickAccessToken: "unrelated-legacy-token" }] : [];
    const userExistsMock = t.mock.fn(async query =>
    {
        // Legacy associations may exist, but must not be scanned or block links.
        assert.deepEqual(query, { userId: appUserId });
        return userExists;
    });
    const UserModel = { exists: userExistsMock };
    const StateModel = {
        create: async record =>
        {
            stateRecord = record;
            states.set(record.stateHash, record);
        },
        findOneAndDelete: async query =>
        {
            const record = states.get(query.stateHash);
            if (!record || record.expiresAt <= query.expiresAt.$gt)
            {
                return null;
            }
            states.delete(query.stateHash);
            return record;
        }
    };
    const keyFor = id => `${id}:ticktick`;
    const ConnectedAccountModel = {
        findOne: async query =>
        {
            assert.deepEqual(Object.keys(query).sort(), ["credentialFingerprint", "provider"]);
            assert.equal(query.provider, "ticktick");
            if (lookupFails)
            {
                throw new Error("Database lookup failed");
            }
            if (forcePrecheckMiss)
            {
                return null;
            }
            return [...accounts.values()].find(account => account.provider === "ticktick" &&
                account.credentialFingerprint === query.credentialFingerprint) || null;
        },
        exists: async () =>
        {
            throw new Error("Global unidentified-owner checks are forbidden");
        },
        findOneAndUpdate: async (query, changes, options) =>
        {
            operations.push({ query, changes, options });
            assert.deepEqual(query, { userId: appUserId, provider: "ticktick" });
            assert.deepEqual(changes.$setOnInsert, query);
            assert.deepEqual(options, { upsert: true, new: true, runValidators: true });
            assert.ok(!Object.hasOwn(changes.$set, "userId"));
            assert.ok(!Object.hasOwn(changes.$set, "createdAt"));
            await new ConnectedAccount({ ...query, ...changes.$set }).validate();
            if (writeFails)
            {
                throw new Error("Database write failed");
            }
            // Simulate index enforcement at the atomic write, including races
            // where both callers observed no owner during the advisory precheck.
            const collision = [...accounts.values()].some(account => account.provider === "ticktick" &&
                account.userId !== appUserId && account.credentialFingerprint === changes.$set.credentialFingerprint);
            if (duplicate || collision)
            {
                throw Object.assign(new Error("Duplicate credential"), { code: 11000 });
            }
            const existing = accounts.get(keyFor(appUserId));
            const saved = { ...existing, ...query, ...changes.$set,
                _id: existing?._id || new mongoose.Types.ObjectId(),
                createdAt: existing?.createdAt || new Date(), updatedAt: new Date() };
            if (!existing)
            {
                insertions += 1;
            }
            accounts.set(keyFor(appUserId), saved);
            writes.push(saved);
            return saved;
        }
    };
    const exchangeCode = t.mock.fn(async () => ({ ...tokens }));
    const service = createTickTickLinkService({ UserModel, StateModel, ConnectedAccountModel,
        AuthIdentityModel: { exists: async () => google }, exchangeCode });
    return {
        service, writes, operations, exchangeCode, accounts, userExistsMock, legacyUsers,
        get record() { return stateRecord; },
        get account() { return accounts.get(keyFor(appUserId)); },
        get insertions() { return insertions; },
        setTokens(value) { tokens = value; },
        seedConnection(token = "previous-access-token")
        {
            const encrypted = encryptProviderToken(token,
                { userId: appUserId, provider: "ticktick", tokenType: "access" });
            const account = {
                _id: new mongoose.Types.ObjectId(), userId: appUserId, provider: "ticktick", connected: true,
                providerAccountId: "previously-verified-id", credentialFingerprint: fingerprintTickTickCredential(token),
                encryptedAccessToken: encrypted.encryptedToken, encryptedRefreshToken: "previous-refresh-ciphertext",
                tokenKeyId: encrypted.keyId, createdAt: new Date("2025-01-01"), metadata: { keep: "unchanged" }
            };
            accounts.set(keyFor(appUserId), account);
            return account;
        },
        async start()
        {
            const result = await service.startLink({ userId: appUserId, redirectUri, clientNonce: nonce });
            return new URL(result.authorizationUrl).searchParams.get("state");
        }
    };
}

function invoke(router, { method = "GET", path = "/callback", query = {}, body = {}, token } = {})
{
    return new Promise((resolve, reject) =>
    {
        const req = { method, url: path, query, body,
            headers: token ? { authorization: `Bearer ${token}` } : {} };
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

test("Google-backed application user links encrypted TickTick credentials without a new User or JWT", async t =>
{
    const f = fixture(t);
    const createUser = t.mock.method(User, "create", async () => { throw new Error("Must not create users"); });
    const state = await f.start();
    assert.equal(f.record.userId, userId);
    assert.equal(f.record.stateHash, createHash("sha256").update(state).digest("hex"));
    assert.notEqual(f.record.stateHash, state);
    assert.ok(f.record.expiresAt > new Date());
    assert.ok(f.record.expiresAt <= new Date(Date.now() + 600000));
    assert.equal(f.record.providerRedirectUri, callbackUri);
    const result = await f.service.completeLink({ state, code: "authorization-code" });
    assert.equal(f.writes.length, 1);
    const saved = f.writes[0];
    assert.equal(saved.userId, userId);
    assert.equal(saved.provider, "ticktick");
    assert.equal(saved.connected, true);
    assert.equal(saved.providerAccountId, null);
    assert.equal(saved.credentialFingerprint, fingerprintTickTickCredential(access));
    assert.equal(f.insertions, 1);
    assert.equal(saved.tokenKeyId, "k1");
    assert.ok(saved.tokenEncryptedAt instanceof Date);
    assert.ok(!JSON.stringify(saved).includes(access));
    assert.ok(!JSON.stringify(saved).includes(refresh));
    assert.equal(decryptProviderToken(saved.encryptedAccessToken, { userId, provider: "ticktick", tokenType: "access" }), access);
    assert.equal(decryptProviderToken(saved.encryptedRefreshToken, { userId, provider: "ticktick", tokenType: "refresh" }), refresh);
    assert.equal(createUser.mock.callCount(), 0);
    const redirect = new URL(result.redirectUrl);
    assert.deepEqual([...redirect.searchParams.keys()], ["ticktick_link", "client_nonce"]);
    assert.equal(redirect.searchParams.get("client_nonce"), nonce);
    assert.ok(!result.redirectUrl.includes(access));
    assert.ok(!result.redirectUrl.includes(refresh));
    assert.ok(!JSON.stringify(result).includes(saved.credentialFingerprint));
    assert.deepEqual(f.exchangeCode.mock.calls[0].arguments, ["authorization-code", callbackUri]);
    await assert.rejects(f.service.completeLink({ state, code: "another-code" }), { code: "INVALID_LINK_STATE" });
});

test("link route uses JWT identity, ignores supplied owner/account IDs, and rejects unauthenticated requests", async t =>
{
    const f = fixture(t);
    t.mock.method(User, "findOne", async query =>
    {
        assert.equal(query.userId, userId);
        return { userId, _id: new mongoose.Types.ObjectId() };
    });
    const router = createTickTickLinkRouter({ service: f.service });
    const body = { redirect_uri: redirectUri, client_nonce: nonce, userId: "attacker", providerAccountId: "attacker" };
    const unauthorized = await invoke(router, { method: "POST", path: "/link", body });
    assert.equal(unauthorized.statusCode, 401);
    const invalid = await invoke(router, { method: "POST", path: "/link", body, token: "invalid" });
    assert.equal(invalid.statusCode, 401);
    const token = jwt.sign({ userId }, process.env.JWT_SECRET);
    const success = await invoke(router, { method: "POST", path: "/link", body, token });
    assert.equal(success.statusCode, 200);
    assert.equal(success.headers["Cache-Control"], "no-store");
    assert.equal(f.record.userId, userId);
    assert.ok(!JSON.stringify(success.data).includes(token));
    const url = new URL(success.data.data.authorizationUrl);
    assert.equal(url.origin, "https://ticktick.com");
    assert.equal(url.searchParams.get("redirect_uri"), callbackUri);
    const callback = await invoke(router, { query: { state: url.searchParams.get("state"), code: "code", userId: "attacker" } });
    assert.equal(callback.statusCode, 302);
    assert.equal(f.writes[0].userId, userId);
    assert.ok(!JSON.stringify(callback).includes(f.writes[0].credentialFingerprint));
});

for (const mode of ["malformed", "unknown", "expired"])
{
    test(`${mode} linking state is rejected before token exchange`, async t =>
    {
        const f = fixture(t);
        let state = await f.start();
        if (mode === "expired")
        {
            f.record.expiresAt = new Date(Date.now() - 1);
        }
        else
        {
            state = mode === "malformed" ? "invalid" : "x".repeat(43);
        }
        await assert.rejects(f.service.completeLink({ state, code: "code" }), { code: "INVALID_LINK_STATE" });
        assert.equal(f.exchangeCode.mock.callCount(), 0);
        assert.equal(f.writes.length, 0);
    });
}

test("provider denial consumes the state and never persists tokens", async t =>
{
    const f = fixture(t);
    const state = await f.start();
    await assert.rejects(f.service.completeLink({ state, providerError: "access_denied" }), { code: "TICKTICK_LINK_CANCELLED" });
    await assert.rejects(f.service.completeLink({ state, code: "code" }), { code: "INVALID_LINK_STATE" });
    assert.equal(f.exchangeCode.mock.callCount(), 0);
});

for (const token of [access, "another-issued-token"])
{
    test(`same user reconnects ${token === access ? "with the same" : "with a changed"} credential on the existing row`, async t =>
    {
        const f = fixture(t);
        const previous = f.seedConnection(access);
        const metadata = structuredClone(previous.metadata);
        f.setTokens({ access_token: token, refresh_token: "new-refresh" });
        await f.service.completeLink({ state: await f.start(), code: "reconnect-code" });
        assert.equal(f.insertions, 0);
        assert.equal(String(f.account._id), String(previous._id));
        assert.equal(f.account.userId, userId);
        assert.equal(f.account.createdAt, previous.createdAt);
        assert.deepEqual(f.account.metadata, metadata);
        assert.equal(f.account.providerAccountId, null, "old provider ID must not attest a possibly different destination");
        assert.equal(f.account.credentialFingerprint, fingerprintTickTickCredential(token));
        assert.equal(decryptProviderToken(f.account.encryptedAccessToken,
            { userId, provider: "ticktick", tokenType: "access" }), token);
        assert.equal(decryptProviderToken(f.account.encryptedRefreshToken,
            { userId, provider: "ticktick", tokenType: "refresh" }), "new-refresh");
    });
}

test("linking succeeds without Focus History and never calls a provider identity endpoint", async t =>
{
    const f = fixture(t);
    const fetch = t.mock.method(globalThis, "fetch", async () =>
    {
        throw new Error("No Focus History or identity request is permitted");
    });
    await f.service.completeLink({ state: await f.start(), code: "code" });
    assert.equal(f.writes.length, 1);
    assert.equal(fetch.mock.callCount(), 0);
});

test("same-user destination replacement preserves unrelated Notion data", async t =>
{
    const f = fixture(t);
    f.seedConnection();
    const notion = { userId, provider: "notion", providerAccountId: "notion-workspace", metadata: { keep: true } };
    f.accounts.set(`${userId}:notion`, notion);
    await f.service.completeLink({ state: await f.start(), code: "new-destination-code" });
    assert.equal(f.account.providerAccountId, null);
    assert.equal(f.accounts.get(`${userId}:notion`), notion);
    assert.equal(f.accounts.size, 2);
});

test("identical credential cannot be assigned to a second application user", async t =>
{
    const accounts = new Map();
    const first = fixture(t, { accounts });
    await first.service.completeLink({ state: await first.start(), code: "first-code" });
    const second = fixture(t, { accounts, appUserId: "USER_second" });
    await assert.rejects(second.service.completeLink({ state: await second.start(), code: "second-code" }),
        { code: "TICKTICK_ACCOUNT_CONFLICT" });
    assert.equal(second.writes.length, 0);
    assert.equal(accounts.size, 1);
});

test("different credentials are allowed without claiming different external identities", async t =>
{
    const accounts = new Map();
    const first = fixture(t, { accounts });
    await first.service.completeLink({ state: await first.start(), code: "first-code" });
    const second = fixture(t, { accounts, appUserId: "USER_second" });
    second.setTokens({ access_token: "reissued-token-could-be-the-same-external-account" });
    await second.service.completeLink({ state: await second.start(), code: "second-code" });
    assert.equal(accounts.size, 2);
    assert.notEqual(first.account.credentialFingerprint, second.account.credentialFingerprint);
    assert.equal(first.account.providerAccountId, null);
    assert.equal(second.account.providerAccountId, null);
});

test("unrelated legacy and unknown-ID placeholder records do not block linking", async t =>
{
    const f = fixture(t, { legacy: true });
    const placeholder = { userId: "USER_placeholder", provider: "ticktick", providerAccountId: null,
        credentialFingerprint: null, connected: false };
    f.accounts.set("USER_placeholder:ticktick", placeholder);
    await f.service.completeLink({ state: await f.start(), code: "code" });
    assert.equal(f.writes.length, 1);
    assert.equal(f.userExistsMock.mock.callCount(), 1);
    assert.deepEqual(f.legacyUsers, [{ userId: "USER_legacy", tickTickConnected: true,
        tickTickAccessToken: "unrelated-legacy-token" }]);
    assert.equal(f.accounts.get("USER_placeholder:ticktick"), placeholder);
});

for (const options of [{ google: false }, { userExists: false }])
{
    test(`Google identity and user existence remain enforced: ${JSON.stringify(options)}`, async t =>
    {
        const f = fixture(t, options);
        await assert.rejects(async () => f.service.completeLink({ state: await f.start(), code: "code" }));
        assert.equal(f.writes.length, 0);
    });
}

for (const options of [{ duplicate: true }, { writeFails: true }, { lookupFails: true }])
{
    test(`failure retains the last valid connection: ${JSON.stringify(options)}`, async t =>
    {
        const f = fixture(t, options);
        const previous = f.seedConnection();
        await assert.rejects(f.service.completeLink({ state: await f.start(), code: "code" }),
            options.duplicate ? { code: "TICKTICK_ACCOUNT_CONFLICT" } : /Database/);
        assert.equal(f.account, previous);
        assert.equal(f.writes.length, 0);
    });
}

for (const mode of ["exchange", "encryption", "fingerprint-key"])
{
    test(`${mode} failure leaves existing credentials and provider ID untouched`, async t =>
    {
        const f = fixture(t);
        const previous = f.seedConnection();
        const state = await f.start();
        if (mode === "fingerprint-key")
        {
            delete process.env.TICKTICK_CREDENTIAL_FINGERPRINT_KEY;
        }
        else
        {
            f.exchangeCode.mock.mockImplementation(async () =>
            {
                if (mode === "exchange")
                {
                    throw new Error("Provider exchange failed");
                }
                process.env.PROVIDER_TOKEN_KEYS = "invalid-json";
                return { access_token: access, refresh_token: refresh };
            });
        }
        await assert.rejects(f.service.completeLink({ state, code: "code" }));
        assert.equal(f.account, previous);
        assert.equal(f.writes.length, 0);
    });
}

test("database uniqueness defeats concurrent cross-user claims even when both prechecks miss", async t =>
{
    const accounts = new Map();
    const first = fixture(t, { accounts, forcePrecheckMiss: true });
    const second = fixture(t, { accounts, appUserId: "USER_second", forcePrecheckMiss: true });
    const firstState = await first.start();
    const secondState = await second.start();
    const results = await Promise.allSettled([
        first.service.completeLink({ state: firstState, code: "code-1" }),
        second.service.completeLink({ state: secondState, code: "code-2" })
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.find(result => result.status === "rejected").reason.code, "TICKTICK_ACCOUNT_CONFLICT");
    assert.equal(accounts.size, 1);
});

test("concurrent same-user authorizations retain one ConnectedAccount", async t =>
{
    const f = fixture(t);
    const states = await Promise.all([f.start(), f.start()]);
    await Promise.all(states.map(state => f.service.completeLink({ state, code: "code" })));
    assert.equal(f.accounts.size, 1);
    assert.equal(f.insertions, 1);
    assert.equal(String(f.writes[0]._id), String(f.writes[1]._id));
});

test("missing fingerprint configuration rejects initiation before creating a state", async t =>
{
    const f = fixture(t);
    delete process.env.TICKTICK_CREDENTIAL_FINGERPRINT_KEY;
    await assert.rejects(f.start(), { code: "TICKTICK_FINGERPRINT_UNAVAILABLE" });
    assert.equal(f.record, undefined);
    const service = { startLink: async () =>
    {
        throw Object.assign(new Error("secret details"), { code: "TICKTICK_FINGERPRINT_UNAVAILABLE" });
    } };
    const router = createTickTickLinkRouter({ service, authenticate: (req, res, next) =>
    {
        req.user = { userId };
        next();
    } });
    const response = await invoke(router, { method: "POST", path: "/link" });
    assert.equal(response.statusCode, 503);
    assert.ok(!JSON.stringify(response).includes("secret details"));
});

test("link initiation rejects unapproved redirects and missing encryption configuration", async t =>
{
    const f = fixture(t);
    await assert.rejects(f.service.startLink({ userId, redirectUri: "https://evil.example", clientNonce: nonce }),
        { code: "INVALID_LINK_PARAMETERS" });
    delete process.env.PROVIDER_TOKEN_KEYS;
    await assert.rejects(f.start(), { code: "TOKEN_ENCRYPTION_UNAVAILABLE" });
    assert.equal(f.record, undefined);
});

test("callback errors expose no provider payloads, JWTs, tokens, or keys", async t =>
{
    const f = fixture(t);
    const log = t.mock.method(console, "error", () => {});
    const service = { completeLink: async () => { throw new Error(`${access} ${refresh} ${process.env.PROVIDER_TOKEN_KEYS}`); } };
    const result = await invoke(createTickTickLinkRouter({ service }), { query: { state: "s".repeat(43), code: "code" } });
    assert.equal(result.statusCode, 500);
    assert.equal(result.data.message, "TickTick linking failed");
    assert.equal(log.mock.callCount(), 0);
    assert.equal(f.writes.length, 0);
});

test("link state has a TTL and is a different model/collection from legacy OAuth state", () =>
{
    assert.notEqual(TickTickLinkState.collection.name, OAuthState.collection.name);
    assert.ok(TickTickLinkState.schema.indexes().some(([fields, options]) => fields.expiresAt && options.expireAfterSeconds === 0));
});

test("link OAuth exchanges with the dedicated callback and never follows credential-bearing redirects", async t =>
{
    configure(t);
    const url = new URL(getTickTickLinkAuthUrl("s".repeat(43), callbackUri));
    assert.equal(url.searchParams.get("redirect_uri"), callbackUri);
    assert.ok(!url.toString().includes(process.env.TICKTICK_CLIENT_SECRET));
    t.mock.method(globalThis, "fetch", async (endpoint, options) =>
    {
        assert.equal(endpoint, "https://ticktick.com/oauth/token");
        assert.equal(options.redirect, "error");
        assert.equal(options.body.get("redirect_uri"), callbackUri);
        assert.equal(options.body.get("grant_type"), "authorization_code");
        assert.ok(options.headers.Authorization.startsWith("Basic "));
        return { ok: true, json: async () => ({ access_token: access, refresh_token: refresh, token_type: "bearer" }) };
    });
    assert.equal((await exchangeTickTickLinkCode("code", callbackUri)).access_token, access);
});

test("legacy TickTick OAuth initiation and existing-user login remain compatible", async t =>
{
    configure(t);
    let stateRecord;
    let exchangeRecord;
    const legacyUserId = "USER_existing_legacy";
    const legacyUser = { userId: legacyUserId, save: t.mock.fn(async () => {}) };
    t.mock.method(console, "log", () => {});
    t.mock.method(OAuthState, "create", async record => { stateRecord = record; });
    t.mock.method(OAuthState, "findOneAndDelete", async () => stateRecord);
    t.mock.method(OAuthExchange, "create", async record => { exchangeRecord = record; });
    t.mock.method(User, "findOne", async () => legacyUser);
    const createUser = t.mock.method(User, "create", async () => { throw new Error("Duplicate legacy user"); });
    t.mock.method(axios, "post", async () => ({ data: { access_token: "legacy-token", refresh_token: "legacy-refresh" } }));
    const start = await invoke(legacyRouter, { path: "/auth", query: { redirect_uri: redirectUri, client_nonce: nonce, code_challenge: "a".repeat(64) } });
    assert.equal(start.statusCode, 302);
    assert.equal(new URL(start.url).searchParams.get("redirect_uri"), process.env.TICKTICK_REDIRECT_URI);
    const complete = await invoke(legacyRouter, { query: { code: "legacy-code", state: new URL(start.url).searchParams.get("state") } });
    assert.equal(complete.statusCode, 302);
    assert.equal(exchangeRecord.userId, legacyUserId);
    assert.equal(legacyUser.userId, legacyUserId);
    assert.equal(legacyUser.tickTickAccessToken, "legacy-token");
    assert.equal(createUser.mock.callCount(), 0);
    assert.ok(new URL(complete.url).searchParams.has("exchange_code"));
    assert.ok(!complete.url.includes("legacy-token"));
});

test("encrypted credentials are read for new links while legacy sessions still use existing fields", async t =>
{
    configure(t);
    const encrypted = encryptProviderToken(access, { userId, provider: "ticktick", tokenType: "access" });
    let account = { connected: true, encryptedAccessToken: encrypted.encryptedToken, tokenKeyId: encrypted.keyId };
    t.mock.method(ConnectedAccount, "findOne", () => ({ select: async () => account }));
    const legacy = { tickTickConnected: true, tickTickAccessToken: "legacy-token" };
    assert.equal(await getTickTickAccessToken(userId, legacy), access);
    account = null;
    assert.equal(await getTickTickAccessToken(userId, legacy), "legacy-token");
    assert.equal(await getTickTickAccessToken(userId, { tickTickConnected: false }), null);
    account = { connected: false, encryptedAccessToken: null };
    assert.equal(await getTickTickAccessToken(userId, legacy), "legacy-token");
    account = { connected: false, encryptedAccessToken: encrypted.encryptedToken };
    assert.equal(await getTickTickAccessToken(userId, legacy), null);
});


test("a separate TickTick OAuth client can be used without changing legacy configuration", t =>
{
    configure(t);
    process.env.TICKTICK_LINK_CLIENT_ID = "dedicated-link-client";
    process.env.TICKTICK_LINK_CLIENT_SECRET = "dedicated-link-secret";
    const url = new URL(getTickTickLinkAuthUrl("s".repeat(43), callbackUri));
    assert.equal(url.searchParams.get("client_id"), "dedicated-link-client");
    assert.equal(process.env.TICKTICK_CLIENT_ID, "test-client");
    delete process.env.TICKTICK_LINK_CLIENT_SECRET;
    assert.throws(() => getTickTickLinkAuthUrl("s".repeat(43), callbackUri), { code: "TICKTICK_LINK_UNAVAILABLE" });
});

test("provider token exchange failures never expose upstream credentials", async t =>
{
    configure(t);
    t.mock.method(globalThis, "fetch", async () => { throw new Error(`${access} ${process.env.TICKTICK_CLIENT_SECRET}`); });
    await assert.rejects(exchangeTickTickLinkCode("code", callbackUri), error =>
    {
        assert.equal(error.code, "TICKTICK_OAUTH_FAILED");
        assert.ok(!error.message.includes(access));
        assert.ok(!error.message.includes(process.env.TICKTICK_CLIENT_SECRET));
        return true;
    });
});

test("state consumption allows at most one concurrent completion", async t =>
{
    const f = fixture(t);
    const state = await f.start();
    const results = await Promise.allSettled([
        f.service.completeLink({ state, code: "code" }),
        f.service.completeLink({ state, code: "code" })
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(f.exchangeCode.mock.callCount(), 1);
    assert.equal(f.writes.length, 1);
});

test("changed redirect allowlist invalidates an outstanding link", async t =>
{
    const f = fixture(t);
    const state = await f.start();
    process.env.ALLOWED_EXTENSION_REDIRECT_URIS = "https://other.chromiumapp.org/ticktick";
    await assert.rejects(f.service.completeLink({ state, code: "code" }), { code: "INVALID_LINK_PARAMETERS" });
    assert.equal(f.exchangeCode.mock.callCount(), 0);
});


test("fingerprint conflicts return a redacted 409 without exposing the credential fingerprint", async t =>
{
    const f = fixture(t, { duplicate: true });
    f.seedConnection();
    const state = await f.start();
    const response = await invoke(createTickTickLinkRouter({ service: f.service }), { query: { state, code: "code" } });
    assert.equal(response.statusCode, 409);
    assert.ok(!JSON.stringify(response).includes(fingerprintTickTickCredential(access)));
    assert.ok(!JSON.stringify(response).includes(access));
});

test("a reconnect without a refresh token clears old refresh credentials atomically", async t =>
{
    const f = fixture(t);
    const previous = f.seedConnection();
    f.setTokens({ access_token: access });
    await f.service.completeLink({ state: await f.start(), code: "code" });
    assert.equal(f.account.encryptedRefreshToken, null);
    assert.notEqual(f.account.encryptedAccessToken, previous.encryptedAccessToken);
    assert.equal(String(f.account._id), String(previous._id));
});
