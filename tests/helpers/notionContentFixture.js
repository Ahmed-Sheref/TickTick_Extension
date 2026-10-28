import assert from "node:assert/strict";
import { encryptProviderToken } from "../../utils/providerTokenEncryption.js";
import { notionId } from "../../validators/notionValidator.js";
import { createNotionCredentialService } from "../../services/notionCredentials.js";
import { createNotionApiClient } from "../../utils/notionApi.js";
import { createNotionDestinationService } from "../../services/notionDestinationService.js";
import { createNotionContentService } from "../../services/notionContentService.js";

export const uuid = character => `${character.repeat(8)}-${character.repeat(4)}-${character.repeat(4)}-${character.repeat(4)}-${character.repeat(12)}`;
export const ids = { owner: "USER_google_owner", other: "USER_other_owner", content: "a".repeat(24), account: "b".repeat(24),
    page: uuid("a"), source: uuid("d"), database: uuid("f"), created: uuid("9"), workspace: uuid("1"), person: uuid("2"), bot: uuid("3"), selection: uuid("e") };
export const pageResource = (changes = {}) => ({ object: "page", id: ids.page, in_trash: false,
    url: `https://www.notion.so/${ids.page.replaceAll("-", "")}`, properties: { title: { type: "title", title: [{ plain_text: "Reading" }] } }, ...changes });
export const sourceResource = (changes = {}) => ({ object: "data_source", id: ids.source, in_trash: false,
    title: [{ text: { content: "Knowledge" } }], parent: { type: "database_id", database_id: ids.database },
    properties: { "Reading title": { id: "title", name: "Reading title", type: "title", title: {} } }, ...changes });
export const savedContent = (changes = {}) => ({ _id: ids.content, userId: ids.owner, title: "Useful knowledge",
    url: "https://example.com/article", rawText: "First paragraph.\n\nSecond paragraph.", summary: "A useful recap.",
    tags: ["nodejs", "reading"], options: {}, integrations: { tickTickId: "keep-ticktick-task" }, ...changes });

const get = (record, path) => path.split(".").reduce((value, key) => value?.[key], record);
const matches = (record, filter) => Object.entries(filter).every(([path, expected]) => {
    const value = get(record, path);
    if (expected === null) return value == null;
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
        if (expected.$nin) return !expected.$nin.includes(value);
        if ("$ne" in expected) return value !== expected.$ne;
    }
    return String(value) === String(expected);
});
const apply = (record, changes) => {
    const next = structuredClone(record);
    for (const [path, value] of Object.entries(changes.$set || {})) {
        const keys = path.split(".");
        const leaf = keys.pop();
        let target = next;
        for (const key of keys) target = target[key] ??= {};
        target[leaf] = value;
    }
    return next;
};
const query = execute => ({ select: () => Promise.resolve().then(execute),
    then: (resolve, reject) => Promise.resolve().then(execute).then(resolve, reject) });

export function fixture(t, { selected = true, destinationType = "page", content = {}, connected = true,
    google = true, userExists = true, http, refresh } = {}) {
    for (const [key, value] of Object.entries({ NOTION_CLIENT_ID: "fixture-client", NOTION_CLIENT_SECRET: "private-client-secret",
        NOTION_REDIRECT_URI: "https://backend.example/api/v1/integrations/notion/callback", NOTION_API_VERSION: "2026-03-11",
        PROVIDER_TOKEN_ACTIVE_KEY_ID: "test", PROVIDER_TOKEN_KEYS: JSON.stringify({ test: "11".repeat(32) }) })) {
        const before = process.env[key];
        process.env[key] = value;
        t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
    }
    const encrypt = (token, userId = ids.owner, provider = "notion", tokenType = "access") =>
        encryptProviderToken(token, { userId, provider, tokenType }).encryptedToken;
    const account = { _id: ids.account, userId: ids.owner, provider: "notion", connected,
        providerAccountId: `workspace:${ids.workspace}:user:${ids.person}`, notionRefreshLock: null,
        encryptedAccessToken: encrypt("private-access"), encryptedRefreshToken: encrypt("private-refresh", ids.owner, "notion", "refresh"),
        metadata: { workspaceId: ids.workspace, authorizingUserId: ids.person, botId: ids.bot, workspaceName: "Private workspace",
            reconnectRequired: false, unrelated: { keep: true },
            ...(selected ? { notionDestination: { id: destinationType === "page" ? ids.page : ids.source, type: destinationType, selectionId: ids.selection } } : {}) } };
    const f = { accounts: new Map([[ids.owner, account]]), contents: new Map([[ids.content, savedContent(content)]]),
        requests: [], accountQueries: [], contentQueries: [], contentWrites: [], failAt: 0, failFrom: 0,
        userExists, google, http, refresh, page: pageResource(), source: sourceResource(),
        database: { object: "database", id: ids.database, in_trash: false, data_sources: [{ id: ids.source, name: "Knowledge" }] }, encrypt,
        get account() { return this.accounts.get(ids.owner); }, get content() { return this.contents.get(ids.content); } };
    const UserModel = { exists: async filter => f.userExists && [ids.owner, ids.other].includes(filter.userId) };
    const AuthIdentityModel = { exists: async filter => f.google && filter.provider === "google" && [ids.owner, ids.other].includes(filter.userId) };
    const ConnectedAccountModel = {
        findOne(filter) {
            f.accountQueries.push(filter);
            return { select: async projection => {
                f.lastProjection = projection;
                return structuredClone([...f.accounts.values()].find(value => matches(value, filter)) || null);
            } };
        },
        findOneAndUpdate(filter, changes) {
            return query(() => {
                assert.equal(filter.provider, "notion");
                const current = [...f.accounts.values()].find(value => matches(value, filter));
                if (!current) return null;
                const next = apply(current, changes);
                f.accounts.set(current.userId, next);
                return structuredClone(next);
            });
        }
    };
    const ContentModel = {
        findOne(filter) {
            f.contentQueries.push(filter);
            return { select: async () => structuredClone([...f.contents.values()].find(value => matches(value, filter)) || null) };
        },
        findOneAndUpdate(filter, changes) {
            return query(() => {
                f.contentWrites.push({ filter, changes });
                const count = f.contentWrites.length;
                if (count === f.failAt || (f.failFrom && count >= f.failFrom)) throw new Error("private database payload");
                const current = [...f.contents.values()].find(value => matches(value, filter));
                if (!current) return null;
                const next = apply(current, changes);
                f.contents.set(String(current._id), next);
                return structuredClone(next);
            });
        }
    };
    const refreshTokens = t.mock.fn(async token => {
        assert.equal(token, "private-refresh");
        return f.refresh ? f.refresh(token) : { token_type: "bearer", access_token: "rotated-access", refresh_token: "rotated-refresh" };
    });
    const credentials = createNotionCredentialService({ UserModel, AuthIdentityModel, ConnectedAccountModel, refreshTokens });
    const defaultHttp = request => {
        if (request.path === "/search") return Response.json({ object: "list", results: [f.page, f.source], has_more: false, next_cursor: null });
        if (request.method === "GET" && request.path === `/pages/${ids.page}`) return Response.json(f.page);
        if (request.method === "GET" && request.path === `/data_sources/${ids.source}`) return Response.json(f.source);
        if (request.method === "GET" && request.path === `/databases/${ids.database}`) return Response.json(f.database);
        if (request.method === "GET" && request.path === `/pages/${ids.created}`) return Response.json({ ...pageResource({ id: ids.created }),
            parent: { type: destinationType === "page" ? "page_id" : "data_source_id",
                [destinationType === "page" ? "page_id" : "data_source_id"]: destinationType === "page" ? ids.page : ids.source } });
        if (request.method === "POST" && request.path === "/pages") return Response.json({ object: "page", id: ids.created,
            url: `https://www.notion.so/actual-created-page-${ids.created.replaceAll("-", "")}` });
        if (request.method === "PATCH") return Response.json({ object: "list", results: request.body.children.map((_, index) =>
            ({ object: "block", id: notionId((index + 1).toString(16).padStart(32, "0")) })) });
        throw new Error(`Unexpected fixture request: ${request.method} ${request.path}`);
    };
    const fetchImpl = async (url, options) => {
        assert.equal(new URL(url).origin, "https://api.notion.com");
        assert.equal(options.redirect, "error");
        assert.equal(options.headers["Notion-Version"], "2026-03-11");
        assert.equal(options.headers.Accept, "application/json");
        if (options.body) assert.equal(options.headers["Content-Type"], "application/json");
        assert.ok(options.signal instanceof AbortSignal);
        const request = { path: new URL(url).pathname.slice(3), method: options.method, headers: options.headers,
            body: options.body ? JSON.parse(options.body) : null, bytes: options.body ? Buffer.byteLength(options.body) : 0 };
        f.requests.push(request);
        return f.http ? f.http(request, defaultHttp) : defaultHttp(request);
    };
    const api = createNotionApiClient({ credentials, fetchImpl });
    const destinations = createNotionDestinationService({ api, credentials, ConnectedAccountModel });
    const contents = createNotionContentService({ ContentModel, ConnectedAccountModel, api, credentials, destinations });
    return Object.assign(f, { credentials, api, destinations, service: contents, refreshTokens, ContentModel, ConnectedAccountModel,
        sync: () => contents.syncContent({ userId: ids.owner, contentId: ids.content }),
        writes: () => f.requests.filter(request => request.path === "/pages" || request.method === "PATCH") });
}
