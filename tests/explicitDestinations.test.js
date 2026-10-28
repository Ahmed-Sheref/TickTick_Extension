import test from "node:test";
import assert from "node:assert/strict";
import { contentDestinations } from "../validators/contentDestinations.js";
import { createTickTickContentService } from "../services/ticktickContentService.js";
import { contentSyncStatus, createContentSyncStatusService } from "../services/contentSyncStatusService.js";
import { createPostContentCreationService } from "../services/postContentCreationService.js";
import { fixture as notionFixture, ids } from "./helpers/notionContentFixture.js";

const contentId = "a".repeat(24);
const get = (doc, path) => path.split(".").reduce((value, key) => value?.[key], doc);
function worker({ failure, aiFailure = false } = {})
{
    const doc = { _id: contentId, userId: "owner", title: "Original article", rawText: "Original text", tags: ["original"],
        destinations: { ticktick: { enabled: true, projectId: "reading", options: { useAiSummary: true, useAiTags: true, mergeSummaryWithContent: true, tags: ["manual"] } } },
        integrations: { ticktick: { status: "queued" }, notion: { status: "synced", pageId: "old-notion-page" } } };
    const writes = [], requests = [];
    let gate, release;
    const model = {
        findOne: filter => ({ select: async () => filter.userId === doc.userId && filter._id === doc._id ? structuredClone(doc) : null }),
        findOneAndUpdate: (filter, update) => ({ select: async () => {
            if (!Object.entries(filter).every(([key, value]) => value?.$nin ? !value.$nin.includes(get(doc, key)) : value === null ? get(doc, key) == null : get(doc, key) === value)) return null;
            if (failure === "persist" && update.$set["integrations.ticktick.status"] === "synced") throw new Error("Database unavailable");
            for (const [path, value] of Object.entries(update.$set)) {
                const parts = path.split("."); let target = doc;
                for (const key of parts.slice(0, -1)) target = target[key] ??= {};
                target[parts.at(-1)] = value;
            }
            writes.push(update); return structuredClone(doc);
        } })
    };
    const service = createTickTickContentService({ ContentModel: model, getToken: async () => "server-only-token", getProjects: async () => [{ id: "reading" }],
        analyze: async () => { if (aiFailure) throw new Error("AI unavailable"); return { summary: "Provider recap", ai_tags: ["generated"] }; },
        createTask: async (token, payload) => {
            requests.push({ token, payload });
            if (gate) await gate;
            if (failure === "transport") throw new Error("No acknowledgement");
            if (failure === "rejected") throw { response: { status: 403 } };
            if (failure === "5xx") throw { response: { status: 503 } };
            return failure === "malformed" ? {} : { id: "confirmed-task" };
        } });
    return { doc, requests, writes, service, sync: () => service.syncContent({ userId: "owner", contentId }),
        hold: () => { gate = new Promise(resolve => { release = resolve; }); }, release: () => release() };
}

for (const payload of [{}, { projectId: "legacy-project" }, { destinations: {} }, { destinations: { ticktick: { enabled: false }, notion: { enabled: false } } }])
    test(`missing external selection is library-only: ${JSON.stringify(payload)}`, () => {
        const result = contentDestinations(payload);
        assert.equal(result.ticktick.enabled, false); assert.equal(result.notion.enabled, false);
    });

for (const payload of [
    { destinations: { ticktick: { enabled: true } } }, { destinations: null }, { destinations: [] }, { destinations: { unknown: {} } }, { destinations: { ticktick: null } },
    { destinations: { notion: { enabled: "true" } } }, { destinations: { ticktick: { enabled: false, projectId: "x" } } },
    { destinations: { ticktick: { enabled: true, accessToken: "secret" } } }, { destinations: { ticktick: { enabled: true, projectId: {} } } },
    { ticktickOptions: { useAiTags: true } }, { destinations: { ticktick: { enabled: true, projectId: "reading" } }, ticktickOptions: { useAiTags: "true" } },
    { destinations: { ticktick: { enabled: true, projectId: "reading" } }, ticktickOptions: { tags: [null] } }, { refreshToken: "secret" },
    { destinations: { notion: { enabled: true, destinationId: "x", destinationType: "page" } } }
]) test(`invalid provider contract rejects ${JSON.stringify(payload)}`, () => assert.throws(() => contentDestinations(payload), { statusCode: 400 }));

test("TickTick exports its own AI data, preserves original content and Notion metadata, and confirms legacy ID atomically", async () => {
    const f = worker();
    const originalNotion = structuredClone(f.doc.integrations.notion);
    await f.sync();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].payload.rawText, "Original text\n\nSummary:\nProvider recap");
    assert.deepEqual(f.requests[0].payload.tags, ["manual", "generated"]);
    assert.equal(f.requests[0].payload.projectId, "reading");
    assert.equal(f.doc.rawText, "Original text");
    assert.deepEqual(f.doc.tags, ["original"]);
    assert.deepEqual(f.doc.integrations.notion, originalNotion);
    assert.equal(f.doc.integrations.ticktick.status, "synced");
    assert.equal(f.doc.integrations.tickTickId, "confirmed-task");
    await f.sync(); assert.equal(f.requests.length, 1);
});

test("AI failure exports original article and truthfully records AI failure", async () => {
    const f = worker({ aiFailure: true }); await f.sync();
    assert.equal(f.requests[0].payload.rawText, "Original text");
    assert.equal(f.doc.integrations.ticktick.summary, null);
    assert.equal(f.doc.integrations.ticktick.aiStatus, "failed");
});

test("TickTick atomic claim permits one concurrent write and never reclaims a pending write", async () => {
    const f = worker(); f.hold();
    const first = f.sync();
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(f.sync(), { code: "TICKTICK_SYNC_IN_PROGRESS" });
    assert.equal(f.requests.length, 1); f.release(); await first;
});

for (const failure of ["transport", "5xx", "malformed", "persist"])
    test(`TickTick ${failure} acknowledgement is uncertain and cannot be blindly retried`, async () => {
        const f = worker({ failure });
        await assert.rejects(f.sync(), { code: "TICKTICK_SYNC_UNCERTAIN" });
        assert.equal(f.doc.integrations.ticktick.status, "uncertain");
        await assert.rejects(f.sync(), { code: "TICKTICK_SYNC_UNCERTAIN" });
        assert.equal(f.requests.length, 1);
        assert.equal(contentSyncStatus(f.doc).ticktick.retryable, false);
    });

test("a definitive rejected TickTick write releases its claim for explicit retry", async () => {
    const f = worker({ failure: "rejected" });
    await assert.rejects(f.sync(), { code: "TICKTICK_SYNC_FAILED" });
    assert.equal(f.doc.integrations.ticktick.status, "failed");
    assert.equal(f.doc.integrations.ticktick.claim, null);
    assert.equal(contentSyncStatus(f.doc).ticktick.retryable, true);
});

test("TickTick ownership and persisted disabled selection block writes", async () => {
    const f = worker();
    await assert.rejects(f.service.syncContent({ userId: "other", contentId }), { statusCode: 404 });
    f.doc.destinations.ticktick.enabled = false;
    await assert.rejects(f.sync(), { code: "TICKTICK_NOT_REQUESTED" });
    assert.equal(f.requests.length, 0);
});

test("status reads are owner scoped, read-only and expose only safe whitelisted fields", async () => {
    const f = worker(); let reads = 0;
    f.doc.integrations.ticktick.claim = "private-claim";
    f.doc.integrations.ticktick.status = "pending";
    const status = createContentSyncStatusService({ ContentModel: { findOne: query => ({ select: async () => {
        reads++; assert.deepEqual(query, { _id: contentId, userId: "owner" }); return f.doc;
    } }) } });
    const result = await status.getStatus({ userId: "owner", contentId });
    assert.equal(reads, 1); assert.equal(result.ticktick.status, "pending");
    assert.equal(result.ticktick.retryable, false);
    assert.equal(result.notion.status, "not_requested");
    assert.ok(!JSON.stringify(result).includes("private-claim"));
    assert.ok(!JSON.stringify(result).includes("Original text"));
    assert.equal(f.requests.length, 0);
    const missing = createContentSyncStatusService({ ContentModel: { findOne: () => ({ select: async () => null }) } });
    await assert.rejects(missing.getStatus({ userId: "other", contentId }), { statusCode: 404 });
    await assert.rejects(missing.getStatus({ userId: "owner", contentId: "invalid" }), { statusCode: 400 });
});

test("legacy records remain readable without synthesizing new provider intent", () => {
    const state = contentSyncStatus({ _id: contentId, integrations: { tickTickId: "legacy-task" } });
    assert.equal(state.ticktick.status, "synced"); assert.equal(state.ticktick.taskId, "legacy-task");
    assert.equal(state.notion.status, "not_requested");
});

for (const ticktick of [false, true]) for (const notion of [false, true])
    test(`dispatch is independent and non-blocking: TickTick=${ticktick}, Notion=${notion}`, async () => {
        const started = [];
        const pending = new Promise(() => {});
        const service = createPostContentCreationService({ syncTickTick: () => { started.push("ticktick"); return pending; },
            syncNotion: () => { started.push("notion"); return pending; } });
        await service.runPostCreationTasks({ content: { _id: contentId, userId: "owner", destinations: { ticktick: { enabled: ticktick }, notion: { enabled: notion } } } });
        assert.deepEqual(started, [...(ticktick ? ["ticktick"] : []), ...(notion ? ["notion"] : [])]);
    });

test("connected Notion default cannot activate a new capture that did not request it", async t => {
    const f = notionFixture(t, { content: { destinations: { notion: { enabled: false } } } });
    assert.deepEqual(await f.service.syncIfSelected({ userId: ids.owner, contentId: ids.content }), { status: "skipped" });
    await assert.rejects(f.sync(), { code: "NOTION_NOT_REQUESTED" });
    assert.equal(f.requests.length, 0);
});

test("Notion selected snapshot cannot be redirected by changing the account default", async t => {
    const f = notionFixture(t, { content: { destinations: { notion: { enabled: true, id: ids.page, type: "page", selectionId: ids.selection,
        connectionId: ids.account, connectionIdentity: `workspace:${ids.workspace}:user:${ids.person}`, workspaceId: ids.workspace } } } });
    f.accounts.get(ids.owner).metadata.notionDestination.selectionId = ids.bot;
    await assert.rejects(f.sync(), { code: "NOTION_SYNC_CONFLICT" });
    assert.equal(f.requests.length, 0);
});

// Intent, stored bootstrap state and public projection are distinct contracts.
import { buildInitialIntegrationStates } from "../services/contentIntegrationState.js";

for (const ticktick of [false, true])
{
    for (const notion of [false, true])
    {
        test(`initial state preserves provider contracts: TickTick=${ticktick}, Notion=${notion}`, () =>
        {
            const destinations = {
                ticktick: { enabled: ticktick, projectId: "reading", options: { useAiSummary: true, useAiTags: false } },
                notion: { enabled: notion }
            };
            const before = structuredClone(destinations);
            const integrations = buildInitialIntegrationStates(destinations);
            assert.deepEqual(destinations, before);
            assert.deepEqual(integrations, ticktick ? {
                ticktick: { status: "queued", projectId: "reading", aiStatus: "pending" }
            } : {});
            assert.equal(integrations.notion, undefined);
            const state = contentSyncStatus({ _id: contentId, destinations, integrations });
            assert.equal(state.ticktick.status, ticktick ? "queued" : "not_requested");
            assert.equal(state.notion.status, notion ? "queued" : "not_requested");
            assert.equal(state.ticktick.retryable, ticktick);
            assert.equal(state.notion.retryable, notion);
        });
    }
}

test("initial TickTick AI status depends only on its persisted export options", () =>
{
    for (const [summary, tags] of [[false, false], [false, true], [true, false], [true, true]])
    {
        const state = buildInitialIntegrationStates({ ticktick: {
            enabled: true, projectId: "reading", options: { useAiSummary: summary, useAiTags: tags }
        }, notion: { enabled: false } });
        assert.equal(state.ticktick.aiStatus, summary || tags ? "pending" : "not_requested");
    }
});
