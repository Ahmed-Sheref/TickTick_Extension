import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ids, uuid, pageResource, sourceResource, savedContent } from "./helpers/notionContentFixture.js";
import { createNotionContentRouter } from "../Routes/notionContentRoute.js";
import { mapNotionContent, nextNotionBatch, splitNotionText } from "../utils/notionContentBlocks.js";
import { createPostContentCreationService } from "../services/postContentCreationService.js";
import Content from "../Models/Content.js";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import User from "../Models/User.js";
import jwt from "jsonwebtoken";

const search = f => f.destinations.discover({ userId: ids.owner });
const select = (f, type = "page", id = ids.page) => f.destinations.select({ userId: ids.owner,
    body: { destinationId: id, destinationType: type } });
const paragraphs = count => Array.from({ length: count }, (_, index) => `Paragraph ${index + 1}.`).join("\n\n");
const reject = (status, body = {}) => Response.json({ object: "error", message: "private-access private-refresh private-client-secret", ...body }, { status });

test("access credentials are looked up by the existing Google owner with only access ciphertext selected", async t => {
    const f = fixture(t);
    const result = await f.credentials.getForUser({ userId: ids.owner });
    assert.equal(result.accessToken, "private-access");
    assert.deepEqual(f.accountQueries[0], { userId: ids.owner, provider: "notion" });
    assert.ok(f.lastProjection.includes("+encryptedAccessToken"));
    assert.ok(!f.lastProjection.includes("encryptedRefreshToken"));
    assert.equal(result.connection.workspaceId, ids.workspace);
    await assert.rejects(f.credentials.getForUser({ userId: ids.other }), { code: "NOTION_NOT_CONNECTED" });
});

for (const [name, options, mutate, code] of [
    ["missing user", { userExists: false }, null, "GOOGLE_IDENTITY_REQUIRED"],
    ["missing Google identity", { google: false }, null, "GOOGLE_IDENTITY_REQUIRED"],
    ["disconnected", { connected: false }, null, "NOTION_NOT_CONNECTED"],
    ["reconnect required", {}, f => { f.account.metadata.reconnectRequired = true; }, "NOTION_RECONNECT_REQUIRED"],
    ["refresh held", {}, f => { f.account.notionRefreshLock = "held"; }, "NOTION_REFRESH_UNAVAILABLE"],
    ["unverified identity", {}, f => { f.account.providerAccountId = "unverified"; }, "NOTION_RECONNECT_REQUIRED"],
    ["missing encrypted access", {}, f => { f.account.encryptedAccessToken = null; }, "NOTION_RECONNECT_REQUIRED"]
]) test(`credential access fails closed: ${name}`, async t => {
    const f = fixture(t, options);
    mutate?.(f);
    await assert.rejects(search(f), { code });
    assert.equal(f.requests.length, 0);
});

for (const context of ["owner", "provider", "token type"])
    test(`access decryption rejects a different authenticated ${context} context`, async t => {
        const f = fixture(t);
        f.account.encryptedAccessToken = f.encrypt("private-access", context === "owner" ? ids.other : ids.owner,
            context === "provider" ? "ticktick" : "notion", context === "token type" ? "refresh" : "access");
        await assert.rejects(search(f), { code: "NOTION_RECONNECT_REQUIRED" });
        assert.equal(f.requests.length, 0);
    });

test("a 401 uses the authoritative atomic refresh service once and retries with persisted ciphertext", async t => {
    const f = fixture(t);
    f.http = (request, fallback) => f.requests.length === 1 ? reject(401) : fallback(request);
    await search(f);
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[0].headers.Authorization, "Bearer private-access");
    assert.equal(f.requests[1].headers.Authorization, "Bearer rotated-access");
    assert.equal(f.refreshTokens.mock.callCount(), 1);
    assert.equal(f.account.notionRefreshLock, null);
    assert.deepEqual(f.account.metadata.unrelated, { keep: true });
    assert.equal(f.account.metadata.notionDestination.id, ids.page);
});

test("a second 401 stops without a loop and conditionally marks reconnection required", async t => {
    const f = fixture(t, { http: () => reject(401) });
    await assert.rejects(search(f), { code: "NOTION_RECONNECT_REQUIRED" });
    assert.equal(f.refreshTokens.mock.callCount(), 1);
    assert.equal(f.requests.length, 2);
    assert.equal(f.account.connected, false);
    assert.equal(f.account.metadata.reconnectRequired, true);
});

test("an already rotated token is reused after 401 without another refresh", async t => {
    const f = fixture(t);
    f.http = (request, fallback) => {
        if (f.requests.length === 1) {
            f.account.encryptedAccessToken = f.encrypt("parallel-rotated-access");
            return reject(401);
        }
        return fallback(request);
    };
    await search(f);
    assert.equal(f.refreshTokens.mock.callCount(), 0);
    assert.equal(f.requests[1].headers.Authorization, "Bearer parallel-rotated-access");
});

test("an occupied refresh claim is surfaced without polling or duplicate rotation", async t => {
    const f = fixture(t);
    f.http = () => { f.account.notionRefreshLock = "another-operation"; return reject(401); };
    await assert.rejects(search(f), { code: "NOTION_REFRESH_UNAVAILABLE" });
    assert.equal(f.refreshTokens.mock.callCount(), 0);
    assert.equal(f.requests.length, 1);
});

test("failed refresh requires reconnect and never leaks the provider failure", async t => {
    const f = fixture(t, { http: () => reject(401), refresh: () => { throw new Error("private-access private-refresh"); } });
    await assert.rejects(search(f), error => error.code === "NOTION_RECONNECT_REQUIRED" && !error.message.includes("private"));
    assert.equal(f.refreshTokens.mock.callCount(), 1);
    assert.equal(f.requests.length, 1);
});

for (const [status, code] of [[400, "NOTION_INVALID_REQUEST"], [403, "NOTION_PERMISSION_DENIED"],
    [404, "NOTION_RESOURCE_NOT_FOUND"], [429, "NOTION_RATE_LIMITED"], [503, "NOTION_PROVIDER_UNAVAILABLE"], [529, "NOTION_PROVIDER_UNAVAILABLE"]])
    test(`provider HTTP ${status} is normalized and never causes a refresh`, async t => {
        const f = fixture(t, { http: () => reject(status) });
        await assert.rejects(search(f), error => error.code === code && !error.message.includes("private"));
        assert.equal(f.requests.length, 1);
        assert.equal(f.refreshTokens.mock.callCount(), 0);
    });

test("the API host, route set, version, redirects and timeouts cannot be controlled by input", async t => {
    const f = fixture(t);
    for (const path of ["https://evil.example/pages", "//evil.example", "/oauth/token", `/pages/${ids.page}?url=https://evil.example`])
        await assert.rejects(f.api.request({ userId: ids.owner, method: "GET", path }), { code: "INVALID_NOTION_INPUT" });
    assert.equal(f.requests.length, 0);
    await search(f); // The fixture asserts the fixed host and required headers/signal.
    const previous = process.env.NOTION_API_VERSION;
    process.env.NOTION_API_VERSION = "2022-06-28";
    await assert.rejects(search(f), { code: "NOTION_LINK_UNAVAILABLE" });
    process.env.NOTION_API_VERSION = previous;
    process.env.PROVIDER_TOKEN_KEYS = "invalid-test-configuration";
    await assert.rejects(search(f), { code: "TOKEN_ENCRYPTION_UNAVAILABLE" });
});

for (const [name, response] of [
    ["HTML", () => new Response("private-access", { headers: { "content-type": "text/html" } })],
    ["invalid JSON", () => new Response("private-access", { headers: { "content-type": "application/json" } })],
    ["oversized JSON", () => Response.json({ data: "x".repeat(2 * 1024 * 1024) })],
    ["non-object JSON", () => Response.json([])]
]) test(`bounded provider reads reject ${name}`, async t => {
    const f = fixture(t, { http: response });
    await assert.rejects(search(f), { code: "NOTION_INVALID_RESPONSE" });
});

test("discovery normalizes accessible pages/data sources and exposes only safe display fields", async t => {
    const f = fixture(t);
    f.page.properties.title.title = [{ plain_text: "<script>display text only</script>" }];
    f.page.url = "javascript:private-access";
    f.source.last_edited_time = "2026-01-02T03:04:05.000Z";
    const data = await search(f);
    assert.deepEqual(data.destinations[0], { id: ids.page, type: "page", title: "<script>display text only</script>", url: null, lastEditedTime: null });
    assert.equal(data.destinations[1].title, "Knowledge");
    assert.equal(data.destinations[1].lastEditedTime, f.source.last_edited_time);
    assert.deepEqual(Object.keys(data).sort(), ["destinations", "hasMore", "nextCursor"]);
    assert.ok(!JSON.stringify(data).includes("private"));
    assert.deepEqual(f.requests[0].body, { page_size: 50 });
});

test("discovery paginates one bounded Search page and passes the validated cursor", async t => {
    const f = fixture(t, { http: () => Response.json({ object: "list", results: [], has_more: true, next_cursor: uuid("8") }) });
    const data = await f.destinations.discover({ userId: ids.owner, query: { query: "  ideas  ", cursor: uuid("7") } });
    assert.equal(data.nextCursor, uuid("8"));
    assert.equal(data.hasMore, true);
    assert.deepEqual(f.requests[0].body, { query: "ideas", start_cursor: uuid("7"), page_size: 50 });
    assert.equal(f.requests.length, 1);
});

test("discovery handles missing titles, trash, unsupported objects and empty results", async t => {
    const f = fixture(t);
    f.http = () => Response.json({ object: "list", results: [pageResource({ properties: {} }), sourceResource({ in_trash: true }),
        { object: "database", id: ids.database }], has_more: false, next_cursor: null });
    assert.equal((await search(f)).destinations[0].title, "Untitled page");
    assert.equal((await search(f)).destinations.length, 1);
    f.http = () => Response.json({ object: "list", results: [], has_more: false, next_cursor: null });
    assert.deepEqual((await search(f)).destinations, []);
});

for (const data of [{}, { object: "list", results: null, has_more: false },
    { object: "list", results: [], has_more: true, next_cursor: "unsafe/cursor" },
    { object: "list", results: [{ object: "page", id: "bad" }], has_more: false }])
    test(`malformed Search response is controlled: ${JSON.stringify(data).slice(0, 65)}`, async t => {
        const f = fixture(t, { http: () => Response.json(data) });
        await assert.rejects(search(f), { code: "NOTION_INVALID_RESPONSE" });
    });

for (const query of [{ query: {} }, { cursor: "bad" }, { query: "a".repeat(201) }, { userId: ids.other }, { query: "bad\0query" }])
    test(`invalid discovery input is rejected before HTTP: ${Object.keys(query)}`, async t => {
        const f = fixture(t);
        await assert.rejects(f.destinations.discover({ userId: ids.owner, query }), { code: "INVALID_NOTION_INPUT" });
        assert.equal(f.requests.length, 0);
    });

test("explicit selection verifies the resource, preserves account metadata/credentials, and never creates a page", async t => {
    const f = fixture(t, { selected: false });
    const before = structuredClone(f.account);
    assert.deepEqual(await f.destinations.getSelection({ userId: ids.owner }), { destination: null });
    const data = await select(f);
    assert.equal(data.destination.id, ids.page);
    assert.equal(f.account.metadata.notionDestination.id, ids.page);
    assert.ok(f.account.metadata.notionDestination.selectionId);
    for (const key of ["encryptedAccessToken", "encryptedRefreshToken", "providerAccountId", "_id"])
        assert.equal(f.account[key], before[key]);
    assert.deepEqual(f.account.metadata.unrelated, before.metadata.unrelated);
    assert.equal(f.writes().length, 0);
    assert.deepEqual(await f.destinations.getSelection({ userId: ids.owner }), { destination: { id: ids.page, type: "page" } });
    assert.deepEqual(await f.destinations.clear({ userId: ids.owner }), { destination: null });
    assert.equal(f.account.metadata.notionDestination, null);
    assert.deepEqual(f.account.metadata.unrelated, before.metadata.unrelated);
});

test("selection cannot be used to read or write another user's Notion account", async t => {
    const f = fixture(t);
    const before = structuredClone(f.account);
    await assert.rejects(f.destinations.select({ userId: ids.other, body: { destinationId: ids.page, destinationType: "page" } }), { code: "NOTION_NOT_CONNECTED" });
    assert.deepEqual(f.account, before);
    assert.equal(f.requests.length, 0);
});

test("a single-source database alias is verified and stored as a canonical data source", async t => {
    const f = fixture(t);
    const data = await select(f, "database", ids.database);
    assert.equal(data.destination.id, ids.source);
    assert.equal(data.destination.type, "data_source");
    assert.equal(f.account.metadata.notionDestination.type, "data_source");
    assert.deepEqual(f.requests.map(request => request.path), [`/databases/${ids.database}`, `/data_sources/${ids.source}`]);
});

test("a multi-source database never silently selects the first source", async t => {
    const f = fixture(t, { selected: false });
    f.database.data_sources.push({ id: uuid("7"), name: "Other" });
    await assert.rejects(select(f, "database", ids.database), { code: "NOTION_DATABASE_AMBIGUOUS" });
    assert.equal(f.account.metadata.notionDestination, undefined);
});

for (const properties of [null, {}, { Name: { id: "title", type: "rich_text" } },
    { A: { id: "a", type: "title" }, B: { id: "b", type: "title" } }, { Name: { type: "title" } }])
    test(`selection rejects invalid data-source title schema ${JSON.stringify(properties)}`, async t => {
        const f = fixture(t);
        f.source.properties = properties;
        await assert.rejects(select(f, "data_source", ids.source), { code: "NOTION_SCHEMA_INVALID" });
        assert.equal(f.writes().length, 0);
    });

test("selection rejects unsupported types, forged metadata, trashed and inaccessible pages", async t => {
    const f = fixture(t);
    await assert.rejects(select(f, "block"), { code: "NOTION_DESTINATION_UNSUPPORTED" });
    await assert.rejects(f.destinations.select({ userId: ids.owner, body: { destinationId: ids.page, destinationType: "page", title: "Trust me" } }), { code: "INVALID_NOTION_INPUT" });
    f.page.in_trash = true;
    await assert.rejects(select(f), { code: "NOTION_DESTINATION_INVALID" });
    f.http = () => reject(404);
    await assert.rejects(select(f), { code: "NOTION_RESOURCE_NOT_FOUND" });
});

test("a stale selection cannot overwrite a reconnect's replaced metadata", async t => {
    const f = fixture(t, { selected: false });
    f.http = (request, fallback) => {
        f.account.encryptedAccessToken = f.encrypt("reconnected-access");
        f.account.metadata = { ...f.account.metadata, workspaceName: "New connection", notionDestination: null };
        return fallback(request);
    };
    await assert.rejects(select(f), { code: "NOTION_CONNECTION_CHANGED" });
    assert.equal(f.account.metadata.workspaceName, "New connection");
    assert.equal(f.account.metadata.notionDestination, null);
});

test("page-parent save maps the actual body, source, summary and tags and persists the real result", async t => {
    const f = fixture(t);
    const result = await f.sync();
    const create = f.writes()[0];
    assert.deepEqual(create.body.parent, { type: "page_id", page_id: ids.page });
    assert.equal(create.body.properties.title.title[0].text.content, f.content.title);
    const text = JSON.stringify(create.body.children);
    for (const value of ["First paragraph.", "Second paragraph.", "A useful recap.", "https://example.com/article", "#nodejs", "#reading"])
        assert.ok(text.includes(value));
    assert.equal(result.pageId, ids.created);
    assert.match(result.pageUrl, /actual-created-page/);
    assert.equal(result.alreadySynced, false);
    assert.equal(f.content.integrations.notion.status, "synced");
    assert.equal(f.content.integrations.notion.pageUrl, result.pageUrl);
    assert.equal(f.content.integrations.tickTickId, "keep-ticktick-task");
    assert.equal(f.content.integrations.notion.claim, null);
    assert.ok(!JSON.stringify(result).includes("private"));
});

test("data-source save uses the retrieved title property ID even when the title is not named Name", async t => {
    const f = fixture(t, { destinationType: "data_source" });
    f.source.properties = { "My reading headline": { id: "actual-title-id", type: "title", title: {} }, Notes: { id: "notes", type: "rich_text" } };
    await f.sync();
    assert.deepEqual(f.writes()[0].body.parent, { type: "data_source_id", data_source_id: ids.source });
    assert.deepEqual(Object.keys(f.writes()[0].body.properties), ["actual-title-id"]);
});

test("missing optional fields and an already merged summary do not duplicate the body", async t => {
    const f = fixture(t, { content: { url: null, tags: [], summary: null } });
    await f.sync();
    assert.equal(f.writes()[0].body.children.length, 2);
    const mapped = mapNotionContent(savedContent({ rawText: "Original.\n\nSummary:\nRecap.", summary: "Recap.", options: { mergeSummaryWithContent: true } }));
    assert.equal(JSON.stringify(mapped.blocks).split("Recap.").length - 1, 1);
});

test("Unicode-safe 2000-character chunks and long content are preserved across additional block batches", async t => {
    const text = "a".repeat(1999) + "😀" + "z".repeat(2200);
    const chunks = splitNotionText(text);
    assert.equal(chunks.join(""), text);
    assert.ok(chunks.every(chunk => chunk.length <= 2000 && chunk.isWellFormed()));
    const f = fixture(t, { content: { rawText: paragraphs(205), url: null, tags: [], summary: null } });
    await f.sync();
    assert.deepEqual(f.writes().map(request => request.body.children.length), [100, 100, 5]);
    assert.deepEqual(f.writes()[1].body.position, { type: "end" });
    assert.equal(f.content.integrations.notion.blocksWritten, 205);
});

test("UTF-8 byte budgets split batches before the 500KB provider limit", async t => {
    const f = fixture(t, { content: { rawText: Array.from({ length: 90 }, () => "界".repeat(2000)).join("\n\n"), url: null, tags: [], summary: null } });
    await f.sync();
    assert.ok(f.writes().length > 1);
    assert.ok(f.writes().every(request => request.bytes <= 480000 && request.body.children.length <= 100));
    assert.equal(f.content.integrations.notion.blocksWritten, 90);
    assert.equal(nextNotionBatch([], 0).length, 0);
});

for (const changes of [{ rawText: paragraphs(1001) }, { rawText: "x".repeat(400001) }, { url: "javascript:alert(1)" },
    { url: "https://user:secret@example.com" }, { rawText: "bad\0text" }])
    test(`unsupported content fails before any provider write: ${Object.keys(changes)}`, async t => {
        const f = fixture(t, { content: changes });
        await assert.rejects(f.sync(), error => ["NOTION_CONTENT_LIMIT", "NOTION_INVALID_CONTENT"].includes(error.code));
        assert.equal(f.writes().length, 0);
    });

test("content ownership is enforced before any credential or provider access", async t => {
    const f = fixture(t);
    await assert.rejects(f.service.syncContent({ userId: ids.other, contentId: ids.content }), { code: "NOTION_CONTENT_NOT_FOUND" });
    await assert.rejects(f.service.syncContent({ userId: ids.owner, contentId: "c".repeat(24) }), { code: "NOTION_CONTENT_NOT_FOUND" });
    assert.equal(f.requests.length, 0);
    assert.equal(f.accountQueries.length, 0);
    assert.ok(f.contentQueries.every(query => Object.hasOwn(query, "userId")));
});

test("an absent selection skips automatic sync and rejects explicit sync without choosing a resource", async t => {
    const f = fixture(t, { selected: false });
    assert.deepEqual(await f.service.syncIfSelected({ userId: ids.owner, contentId: ids.content }), { status: "skipped" });
    await assert.rejects(f.sync(), { code: "NOTION_DESTINATION_REQUIRED" });
    assert.equal(f.requests.length, 0);
    assert.equal(f.content.integrations.notion, undefined);
});

test("an already synchronized record returns its existing page without creating another", async t => {
    const f = fixture(t);
    const first = await f.sync();
    const calls = f.requests.length;
    const second = await f.sync();
    assert.deepEqual(second, { ...first, alreadySynced: true });
    assert.equal(f.requests.length, calls);
    assert.equal(f.writes().length, 1);
});

test("concurrent synchronization is controlled by an owner-scoped atomic content claim", async t => {
    const f = fixture(t);
    let release;
    let signal;
    const started = new Promise(resolve => { signal = resolve; });
    f.http = async (request, fallback) => {
        if (request.path === "/pages" && request.method === "POST") {
            signal();
            await new Promise(resolve => { release = resolve; });
        }
        return fallback(request);
    };
    const pending = f.sync();
    await started;
    await assert.rejects(f.sync(), { code: "NOTION_SYNC_IN_PROGRESS" });
    release();
    await pending;
    assert.equal(f.writes().length, 1);
    assert.ok(f.contentWrites.every(write => write.filter.userId === ids.owner));
});

test("a definite create rejection remains safely retryable", async t => {
    const f = fixture(t);
    f.http = (request, fallback) => request.path === "/pages" ? reject(429) : fallback(request);
    await assert.rejects(f.sync(), { code: "NOTION_RATE_LIMITED" });
    assert.equal(f.content.integrations.notion.status, "failed");
    assert.equal(f.content.integrations.notion.claim, null);
    f.http = null;
    await f.sync();
    assert.equal(f.content.integrations.notion.status, "synced");
});

for (const mode of ["timeout", "503", "malformed success", "missing page URL"])
    test(`ambiguous create ${mode} retains a durable claim and never blindly retries`, async t => {
        const f = fixture(t);
        f.http = (request, fallback) => {
            if (request.path !== "/pages") return fallback(request);
            if (mode === "timeout") throw new Error("private network payload");
            if (mode === "503") return reject(503);
            return Response.json(mode === "missing page URL" ? { object: "page", id: ids.created } : {});
        };
        await assert.rejects(f.sync(), { code: "NOTION_SYNC_UNCERTAIN" });
        assert.equal(f.content.integrations.notion.status, "uncertain");
        assert.ok(f.content.integrations.notion.claim);
        const calls = f.requests.length;
        await assert.rejects(f.sync(), { code: "NOTION_SYNC_UNCERTAIN" });
        assert.equal(f.requests.length, calls);
        assert.equal(f.writes().length, 1);
    });

test("a definite append failure resumes from persisted progress on the same page", async t => {
    const f = fixture(t, { content: { rawText: paragraphs(105), summary: null, tags: [], url: null } });
    f.http = (request, fallback) => request.method === "PATCH" ? reject(403) : fallback(request);
    await assert.rejects(f.sync(), { code: "NOTION_PERMISSION_DENIED" });
    assert.equal(f.content.integrations.notion.status, "partial");
    assert.equal(f.content.integrations.notion.blocksWritten, 100);
    assert.equal(f.content.integrations.notion.pageId, ids.created);
    f.http = null;
    await f.sync();
    assert.equal(f.writes().filter(request => request.method === "POST").length, 1);
    assert.equal(f.writes().at(-1).body.children.length, 5);
    assert.equal(f.content.integrations.notion.blocksWritten, 105);
});

test("an ambiguous append is quarantined instead of appending the same blocks twice", async t => {
    const f = fixture(t, { content: { rawText: paragraphs(105) } });
    f.http = (request, fallback) => request.method === "PATCH" ? reject(503) : fallback(request);
    await assert.rejects(f.sync(), { code: "NOTION_SYNC_UNCERTAIN" });
    assert.equal(f.content.integrations.notion.pageId, ids.created);
    assert.equal(f.content.integrations.notion.status, "uncertain");
    await assert.rejects(f.sync(), { code: "NOTION_SYNC_UNCERTAIN" });
    assert.equal(f.writes().filter(request => request.method === "PATCH").length, 1);
});

for (const failureAt of [1, 2, 3, 4]) test(`database write failure ${failureAt} preserves primary content and prevents duplicate pages`, async t => {
    const f = fixture(t, { content: { summary: null, url: null, tags: [] } });
    f.failAt = failureAt;
    await assert.rejects(f.sync(), error => ["NOTION_PERSISTENCE_FAILED", "NOTION_SYNC_UNCERTAIN"].includes(error.code));
    assert.equal(f.content.rawText, savedContent().rawText);
    assert.equal(f.content.integrations.tickTickId, "keep-ticktick-task");
    if (failureAt <= 2) assert.equal(f.writes().length, 0);
    if (failureAt === 3) {
        assert.equal(f.content.integrations.notion.status, "uncertain");
        assert.equal(f.content.integrations.notion.pageId, ids.created);
        await assert.rejects(f.sync(), { code: "NOTION_SYNC_UNCERTAIN" });
    }
    if (failureAt === 4) {
        f.failAt = 0;
        await f.sync();
        assert.equal(f.writes().length, 1);
        assert.equal(f.content.integrations.notion.status, "synced");
    }
});

test("a database outage after creation leaves the original claim blocking another creation", async t => {
    const f = fixture(t);
    f.failFrom = 3;
    await assert.rejects(f.sync(), { code: "NOTION_SYNC_UNCERTAIN" });
    assert.equal(f.content.integrations.notion.status, "pending");
    assert.ok(f.content.integrations.notion.claim);
    await assert.rejects(f.sync(), { code: "NOTION_SYNC_IN_PROGRESS" });
    assert.equal(f.writes().length, 1);
});

test("a stale attempt cannot overwrite a newer stored successful synchronization", async t => {
    const f = fixture(t);
    f.http = (request, fallback) => {
        if (request.path === "/pages") f.content.integrations.notion = { status: "synced", claim: null, pageId: uuid("8"), pageUrl: "https://www.notion.so/newer" };
        return fallback(request);
    };
    await assert.rejects(f.sync(), { code: "NOTION_SYNC_UNCERTAIN" });
    assert.equal(f.content.integrations.notion.status, "synced");
    assert.equal(f.content.integrations.notion.pageId, uuid("8"));
});

test("partial retries reject changed content or destination rather than mixing page content", async t => {
    const f = fixture(t, { content: { rawText: paragraphs(105) } });
    f.http = (request, fallback) => request.method === "PATCH" ? reject(403) : fallback(request);
    await assert.rejects(f.sync(), { code: "NOTION_PERMISSION_DENIED" });
    const before = f.requests.length;
    f.content.rawText += " changed";
    await assert.rejects(f.sync(), { code: "NOTION_SYNC_CONFLICT" });
    assert.equal(f.requests.length, before);
});

test("parallel TickTick metadata updates do not invalidate an otherwise available Notion claim", async t => {
    const f = fixture(t, { content: { updatedAt: new Date("2026-01-01") } });
    f.http = (request, fallback) => {
        if (request.method === "GET") {
            f.content.updatedAt = new Date("2026-01-02");
            f.content.integrations.tickTickId = "parallel-ticktick-success";
        }
        return fallback(request);
    };
    await f.sync();
    assert.equal(f.content.integrations.tickTickId, "parallel-ticktick-success");
    assert.equal(f.content.integrations.notion.status, "synced");
});

test("a create-page 401 retries exactly the same payload once through the existing refresh service", async t => {
    const f = fixture(t);
    let unauthorized = true;
    f.http = (request, fallback) => {
        if (request.path === "/pages" && unauthorized) { unauthorized = false; return reject(401); }
        return fallback(request);
    };
    await f.sync();
    assert.equal(f.writes().length, 2);
    assert.deepEqual(f.writes()[0].body, f.writes()[1].body);
    assert.equal(f.refreshTokens.mock.callCount(), 1);
    assert.equal(f.writes()[1].headers.Authorization, "Bearer rotated-access");
});

test("selection changes during synchronization are rechecked before page creation", async t => {
    const f = fixture(t);
    f.http = (request, fallback) => {
        if (request.method === "GET") f.account.metadata.notionDestination.selectionId = uuid("7");
        return fallback(request);
    };
    await assert.rejects(f.sync(), { code: "NOTION_CONNECTION_CHANGED" });
    assert.equal(f.writes().length, 0);
    assert.equal(f.content.integrations.notion.status, "failed");
});

test("a provider-confirmed resource ID in a 503 is retained without fabricating a URL or claiming success", async t => {
    const f = fixture(t);
    f.http = (request, fallback) => request.path === "/pages"
        ? reject(503, { additional_data: { committed_resource_id: ids.created } }) : fallback(request);
    await assert.rejects(f.sync(), { code: "NOTION_SYNC_UNCERTAIN" });
    assert.equal(f.content.integrations.notion.pageId, ids.created);
    assert.equal(f.content.integrations.notion.pageUrl, null);
    assert.equal(f.content.integrations.notion.status, "uncertain");
});

test("new integration state is optional, claim is hidden, and existing indexes are intact", async () => {
    const doc = new Content(savedContent());
    await doc.validate();
    assert.equal(doc.integrations.notion, undefined);
    assert.equal(Content.schema.path("integrations.notion.claim").options.select, false);
    assert.equal(Content.schema.indexes().length, 5);
    assert.equal(ConnectedAccount.schema.indexes().length, 3);
});

test("Notion rejection does not suppress TickTick, and logs never contain raw provider errors", async t => {
    const log = t.mock.method(console, "error", () => {});
    let ticks = 0;
    const service = createPostContentCreationService({ syncNotion: async () => { throw Object.assign(new Error("private-access"), { code: "unsafe-private-code" }); },
        syncTickTick: async () => { ticks++; } });
    await service.runPostCreationTasks({ userId: ids.owner, content: { ...savedContent(), destinations: { ticktick: { enabled: true }, notion: { enabled: true } } } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ticks, 1);
    assert.ok(!JSON.stringify(log.mock.calls).includes("private-access"));
    assert.ok(log.mock.calls.some(call => call.arguments.includes("NOTION_SYNC_FAILED")));
});

test("TickTick rejection does not suppress Notion and a slow Notion task does not block the primary request", async t => {
    t.mock.method(console, "error", () => {});
    let notionStarted = false;
    let release;
    const service = createPostContentCreationService({ syncTickTick: async () => { throw new Error("ticktick unavailable"); },
        syncNotion: async ({ userId }) => { assert.equal(userId, ids.owner); notionStarted = true; await new Promise(resolve => { release = resolve; }); } });
    await service.runPostCreationTasks({ userId: "caller-cannot-replace-content-owner", content: { ...savedContent(), destinations: { ticktick: { enabled: true }, notion: { enabled: true } } } });
    assert.equal(notionStarted, true);
    release();
});

function invoke(router, { method = "GET", path = "/destinations", query = {}, body, authenticated = true, token } = {}) {
    return new Promise((resolve, rejectPromise) => {
        const req = { method, url: path, query, body, headers: token ? { authorization: `Bearer ${token}` } : {}, authenticated };
        const headers = {};
        const res = { statusCode: 200, setHeader() {}, set(name, value) { headers[name] = value; return this; },
            status(code) { this.statusCode = code; return this; }, json(data) { resolve({ status: this.statusCode, data, headers }); return this; } };
        router(req, res, error => rejectPromise(error || new Error("Unmatched route")));
    });
}
const authenticate = (req, res, next) => {
    if (!req.authenticated) return res.status(401).json({ status: "error" });
    req.user = { userId: ids.owner };
    next();
};

test("new routes require authentication, bind only req.user, and keep response data credential-free", async t => {
    const f = fixture(t, { selected: false });
    const router = createNotionContentRouter({ destinations: f.destinations, contents: f.service, authenticate });
    assert.equal((await invoke(router, { authenticated: false })).status, 401);
    const discovery = await invoke(router);
    assert.equal(discovery.status, 200);
    assert.equal(discovery.headers["Cache-Control"], "no-store");
    assert.equal(discovery.data.status, "success");
    const selected = await invoke(router, { method: "PUT", path: "/destination", body: { destinationId: ids.page, destinationType: "page" } });
    assert.equal(selected.status, 200);
    assert.equal((await invoke(router, { path: "/destination" })).data.data.destination.id, ids.page);
    const synced = await invoke(router, { method: "POST", path: `/sync/${ids.content}` });
    assert.equal(synced.status, 200);
    assert.equal(synced.data.data.pageId, ids.created);
    assert.ok(!JSON.stringify([discovery, selected, synced]).includes("private"));
    const forged = await invoke(router, { method: "POST", path: `/sync/${ids.content}`, body: { userId: ids.other } });
    assert.equal(forged.status, 400);
    assert.equal((await invoke(router, { method: "DELETE", path: "/destination" })).data.data.destination, null);
});

test("route errors are stable and sanitized and propagate a validated Retry-After", async t => {
    const f = fixture(t, { http: () => new Response("private-access", { status: 429, headers: { "retry-after": "17" } }) });
    const router = createNotionContentRouter({ destinations: f.destinations, contents: f.service, authenticate });
    const response = await invoke(router);
    assert.equal(response.status, 429);
    assert.equal(response.data.code, "NOTION_RATE_LIMITED");
    assert.equal(response.headers["Retry-After"], "17");
    for (const code of [undefined, "toString", "__proto__", "constructor"]) {
        const failed = createNotionContentRouter({ authenticate, destinations: { discover: () => { throw Object.assign(new Error("private-access stack"), { code }); } } });
        const internal = await invoke(failed);
        assert.equal(internal.status, 500);
        assert.equal(internal.data.code, "NOTION_SYNC_FAILED");
        assert.ok(!JSON.stringify(internal).includes("private"));
    }
});

test("all new endpoints use the unchanged JWT middleware and its resolved application identity", async t => {
    const before = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "test-only-notion-content-jwt";
    t.after(() => { if (before === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = before; });
    t.mock.method(User, "findOne", async query => query.userId === ids.owner ? { userId: ids.owner, _id: "b".repeat(24) } : null);
    let resolvedOwner;
    const router = createNotionContentRouter({ destinations: { getSelection: async ({ userId }) => { resolvedOwner = userId; return { destination: null }; } } });
    for (const [method, path] of [["GET", "/destinations"], ["GET", "/destination"], ["PUT", "/destination"], ["DELETE", "/destination"], ["POST", `/sync/${ids.content}`]]) {
        assert.equal((await invoke(router, { method, path })).status, 401);
        assert.equal((await invoke(router, { method, path, token: "invalid.jwt" })).status, 401);
    }
    const token = jwt.sign({ userId: ids.owner }, process.env.JWT_SECRET, { expiresIn: "1h" });
    assert.equal((await invoke(router, { path: "/destination", token, body: { userId: ids.other } })).status, 200);
    assert.equal(resolvedOwner, ids.owner);
});

test("an expired internal deadline prevents dispatching a write rather than classifying an unsent operation as ambiguous", async t => {
    const f = fixture(t);
    await assert.rejects(f.api.request({ userId: ids.owner, method: "POST", path: "/pages", body: {}, deadline: Date.now() - 1 }),
        error => error.code === "NOTION_PROVIDER_UNAVAILABLE" && error.ambiguous === false);
    assert.equal(f.requests.length, 0);
});
