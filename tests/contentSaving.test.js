import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import axios from "axios";
import jwt from "jsonwebtoken";
import User from "../Models/User.js";
import Content from "../Models/Content.js";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import { encryptProviderToken } from "../utils/providerTokenEncryption.js";
import ticktickContentService from "../services/ticktickContentService.js";
import notionCredentials from "../services/notionCredentials.js";
import notionDestinationService from "../services/notionDestinationService.js";
import notionContentService from "../services/notionContentService.js";
import { Completions } from "groq-sdk/resources/chat/completions";

// Loading the existing AI module requires a key, even when AI is disabled.
// Use a test-only placeholder rather than loading developer credentials.
const previousGroqKey = process.env.GROQ_API_KEY;
process.env.GROQ_API_KEY = "test-only-no-external-requests";
const { default: contentService } = await import("../services/contentService.js");
const { default: app } = await import("../index.js");
if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
else process.env.GROQ_API_KEY = previousGroqKey;

const ownerId = "USER_existing_google_user";
const tickIntent = { ticktick: { enabled: true, projectId: "reading-project" } };
const bothIntent = { ticktick: { enabled: true, projectId: "reading-project" }, notion: { enabled: true } };
const notionIntent = { notion: { enabled: true } };
const settle = () => new Promise(resolve => setImmediate(resolve));
const validPayload = {
    userId: ownerId,
    title: "A useful article",
    url: "https://example.com/article",
    rawText: "Content worth keeping in our own library.",
    user_input: "~reading #Node_JS #nodejs #Express",
    use_tagsAi: false,
    use_summaryAi: false,
    use_quiz: false,
    mergeSummaryWithContent: false
};

function fixture(t, { connected = false, token = connected ? "test-ticktick-token" : null,
    userExists = true, projects = [{ id: "reading-project" }],
    syncFails = false, createFails = false, commitFails = false, updateFails = false, encrypted = false } = {})
{
    const events = [];
    const persisted = new Map();
    let staged = [];
    let inTransaction = false;
    const user = userExists ? {
        _id: new mongoose.Types.ObjectId(), userId: ownerId,
        tickTickConnected: connected, tickTickAccessToken: encrypted ? null : token
    } : null;
    const session = {
        startTransaction() { events.push("start"); inTransaction = true; },
        async commitTransaction() {
            events.push("commit");
            if (commitFails) throw new Error("Database commit failed");
            for (const doc of staged) persisted.set(String(doc._id), doc.toObject());
            inTransaction = false;
        },
        async abortTransaction() { events.push("abort"); staged = []; inTransaction = false; },
        inTransaction() { return inTransaction; },
        async endSession() { events.push("end"); }
    };
    t.mock.method(console, "log", () => {});
    const errors = t.mock.method(console, "error", () => {});
    t.mock.method(mongoose, "startSession", async () => session);
    let linkedAccount = null;
    if (encrypted)
    {
        const previousKeys = process.env.PROVIDER_TOKEN_KEYS;
        const previousActiveKey = process.env.PROVIDER_TOKEN_ACTIVE_KEY_ID;
        process.env.PROVIDER_TOKEN_KEYS = JSON.stringify({ test: "ab".repeat(32) });
        process.env.PROVIDER_TOKEN_ACTIVE_KEY_ID = "test";
        t.after(() =>
        {
            if (previousKeys === undefined) delete process.env.PROVIDER_TOKEN_KEYS;
            else process.env.PROVIDER_TOKEN_KEYS = previousKeys;
            if (previousActiveKey === undefined) delete process.env.PROVIDER_TOKEN_ACTIVE_KEY_ID;
            else process.env.PROVIDER_TOKEN_ACTIVE_KEY_ID = previousActiveKey;
        });
        const encryptedToken = encryptProviderToken(token, { userId: ownerId, provider: "ticktick", tokenType: "access" });
        linkedAccount = { userId: ownerId, provider: "ticktick", connected: true,
            encryptedAccessToken: encryptedToken.encryptedToken, tokenKeyId: encryptedToken.keyId };
    }
    t.mock.method(ConnectedAccount, "findOne", () => ({ select: async () => linkedAccount }));
    const userLookup = t.mock.method(User, "findOne", filter => {
        assert.equal(filter.userId, ownerId);
        const query = Promise.resolve(user);
        query.select = () => query;
        return query;
    });
    const create = t.mock.method(Content, "create", async (documents, options) => {
        events.push("create");
        assert.equal(options.session, session);
        assert.equal(inTransaction, true);
        if (createFails) throw new Error("Database write failed");
        staged = documents.map(document => new Content(document));
        await Promise.all(staged.map(document => document.validate()));
        return staged;
    });
    const fetchProjects = t.mock.method(globalThis, "fetch", async (url, options) => {
        assert.equal(url, "https://api.ticktick.com/open/v1/project");
        assert.equal(options.headers.Authorization, `Bearer ${token}`);
        assert.equal(persisted.size, 1, "project verification runs after commit");
        events.push("projects");
        return { ok: true, json: async () => projects };
    });
    const task = t.mock.method(axios, "post", async (url, payload, options) => {
        assert.equal(url, "https://api.ticktick.com/open/v1/task");
        assert.equal(options.headers.Authorization, `Bearer ${token}`);
        assert.equal(persisted.size, 1, "external sync happens after a committed save");
        assert.equal(inTransaction, false);
        events.push("sync");
        if (syncFails) throw new Error("TickTick unavailable");
        return { data: { id: "ticktick-task-1" } };
    });
    const read = t.mock.method(Content, "findOne", filter => ({ select: async () => {
        const doc = persisted.get(String(filter._id));
        return doc?.userId === filter.userId ? structuredClone(doc) : null;
    } }));
    const update = t.mock.method(Content, "findOneAndUpdate", (filter, changes) => ({ select: async () => {
        events.push("integration-update");
        if (updateFails) throw new Error("Integration metadata update failed");
        const document = persisted.get(String(filter._id));
        const get = (doc, path) => path.split(".").reduce((value, key) => value?.[key], doc);
        if (!document || Object.entries(filter).some(([key, value]) => {
            const actual = get(document, key);
            return value?.$nin ? value.$nin.includes(actual) : value === null ? actual != null : String(actual) !== String(value);
        })) return null;
        for (const [key, value] of Object.entries(changes.$set)) {
            const parts = key.split("."); let obj = document;
            for (const part of parts.slice(0, -1)) obj = obj[part] ??= {};
            obj[parts.at(-1)] = value;
        }
        return document;
    } }));
    t.mock.method(notionCredentials, "getForUser", async () => ({ connection: { accountId: "account", providerAccountId: "identity", workspaceId: "workspace",
        destination: { id: "11111111-1111-1111-1111-111111111111", type: "page", selectionId: "22222222-2222-2222-2222-222222222222" } } }));
    t.mock.method(notionDestinationService, "verify", async () => ({}));
    return { events, persisted, create, fetchProjects, task, update, userLookup, errors };
}

function assertNoSave(f)
{
    assert.equal(f.create.mock.callCount(), 0);
    assert.equal(f.persisted.size, 0);
    assert.equal(f.task.mock.callCount(), 0);
    assert.ok(!f.events.includes("start"));
    assert.equal(f.events.at(-1), "end");
}

for (const project of ["omitted", null, ""])
{
    test(`Google-only user can save with ${project === null ? "null" : project || "empty"} projectId`, async t => {
        const f = fixture(t);
        const payload = { ...validPayload };
        if (project !== "omitted") payload.projectId = project;
        const result = await contentService.createContent(payload);
        assert.equal(f.persisted.size, 1);
        const saved = f.persisted.get(String(result.content._id));
        assert.equal(saved.userId, ownerId);
        assert.equal(saved.title, validPayload.title);
        assert.equal(saved.rawText, validPayload.rawText);
        assert.equal(saved.listName, "reading");
        assert.deepEqual(saved.tags, ["nodejs", "express"]);
        assert.equal(saved.integrations.tickTickId, null);
        assert.deepEqual(result.ai, { summary: null, tags: ["nodejs", "express"], quiz: null });
        assert.deepEqual(saved.options, {
            useSummaryAi: false, useTagsAi: false, useQuiz: false,
            includeInWeeklyEmail: false, includeInTelegramQuiz: false,
            mergeSummaryWithContent: false
        });
        assert.equal(f.fetchProjects.mock.callCount(), 0);
        assert.equal(f.task.mock.callCount(), 0);
        assert.deepEqual(f.events, ["start", "create", "commit", "end"]);
    });
}

for (const projectId of [null, "reading-project"])
{
    test(`explicit TickTick selection uses its verified list with legacy projectId ${projectId}`, async t => {
        const f = fixture(t, { connected: true });
        const result = await contentService.createContent({ ...validPayload, projectId, destinations: tickIntent });
        await settle();
        assert.equal(f.persisted.size, 1);
        assert.equal(f.task.mock.callCount(), 1);
        assert.equal(f.fetchProjects.mock.callCount(), 1);
        const taskPayload = f.task.mock.calls[0].arguments[1];
        assert.equal(taskPayload.projectId, "reading-project");
        assert.equal(taskPayload.title, validPayload.title);
        assert.equal(taskPayload.content, validPayload.rawText);
        assert.deepEqual(taskPayload.tags, []);
        assert.equal(taskPayload.kind, "NOTE");
        assert.equal(f.persisted.get(String(result.content._id)).integrations.tickTickId, "ticktick-task-1");
        assert.ok(f.events.indexOf("commit") < f.events.indexOf("sync"));
        assert.ok(!f.events.includes("abort"));
    });
}

test("Notion post-creation failure preserves the 201 content/AI response and TickTick attempt", async t => {
    const f = fixture(t, { connected: true });
    let notionOwner;
    let notionStartedAfterCommit;
    const notion = t.mock.method(notionContentService, "syncIfSelected", async ({ userId, contentId }) => {
        notionOwner = userId;
        notionStartedAfterCommit = f.persisted.has(String(contentId));
        throw new Error("private-provider-response");
    });
    const res = await invokeApp({ token: authenticatedToken(t), body: { ...validPayload, destinations: bothIntent } });
    await settle();
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.status, "success");
    assert.equal(res.body.data.content.userId, ownerId);
    assert.deepEqual(res.body.data.ai, { summary: null, tags: ["nodejs", "express"], quiz: null });
    assert.equal(f.task.mock.callCount(), 1);
    assert.equal(notion.mock.callCount(), 1);
    assert.equal(notionOwner, ownerId);
    assert.equal(notionStartedAfterCommit, true, "Notion starts only after MongoDB commit");
    assert.ok(!JSON.stringify(res.body).includes("private-provider"));
});

test("the primary content response does not await a slow Notion multi-batch operation", async t => {
    const f = fixture(t);
    let release;
    const notion = t.mock.method(notionContentService, "syncIfSelected", async () => new Promise(resolve => { release = resolve; }));
    const res = await invokeApp({ token: authenticatedToken(t), body: { ...validPayload, destinations: notionIntent } });
    assert.equal(res.statusCode, 201);
    assert.equal(f.persisted.size, 1);
    assert.equal(notion.mock.callCount(), 1);
    release({ status: "synced" });
});

test("legacy AI response remains compatible while original text and library-only intent are preserved", async t => {
    const f = fixture(t);
    t.mock.method(Completions.prototype, "create", async () => ({ choices: [{ message: { content: JSON.stringify({
        summary: "A concise recap.", ai_tags: ["mongodb"], quiz: { question: "Which database?", options: ["MongoDB", "Redis", "Postgres", "SQLite"], correctAnswer: "MongoDB" }
    }) } }] }));
    let committedForNotion;
    const notion = t.mock.method(notionContentService, "syncIfSelected", async ({ contentId }) => {
        committedForNotion = f.persisted.get(String(contentId));
        return { status: "skipped" };
    });
    const res = await invokeApp({ token: authenticatedToken(t), body: { ...validPayload,
        use_tagsAi: true, use_summaryAi: true, use_quiz: true, mergeSummaryWithContent: true } });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.ai.summary, "A concise recap.");
    assert.equal(res.body.data.ai.quiz.correctAnswer, "MongoDB");
    assert.ok(res.body.data.ai.tags.includes("mongodb"));
    assert.equal(notion.mock.callCount(), 0);
    assert.equal(res.body.data.content.summary, "A concise recap.");
    assert.equal(res.body.data.content.rawText, validPayload.rawText);
    assert.deepEqual(res.body.data.content.options.toObject(), {
        useSummaryAi: true, useTagsAi: true, useQuiz: true,
        mergeSummaryWithContent: true, includeInWeeklyEmail: true, includeInTelegramQuiz: true
    });
    assert.deepEqual(Object.keys(res.body.data).sort(), ["ai", "content"]);

});

for (const connection of [
    { connected: false, token: null },
    { connected: true, token: null },
    { connected: false, token: "stale-token" }
])
{
    test(`project selection rejects incomplete TickTick connection ${JSON.stringify(connection)}`, async t => {
        const f = fixture(t, connection);
        await assert.rejects(contentService.createContent({ ...validPayload, projectId: "reading-project", destinations: tickIntent }),
            { statusCode: 401, message: "TickTick account is not connected" });
        assertNoSave(f);
        assert.equal(f.fetchProjects.mock.callCount(), 0);
    });
}

test("a removed TickTick list fails only its export after the primary commit", async t => {
    const f = fixture(t, { connected: true });
    const result = await contentService.createContent({ ...validPayload, destinations: { ticktick: { enabled: true, projectId: "missing-project" } } });
    await settle();
    assert.equal(f.persisted.size, 1); assert.equal(f.task.mock.callCount(), 0);
    assert.equal(f.persisted.get(String(result.content._id)).integrations.ticktick.status, "failed");
    assert.equal(f.fetchProjects.mock.callCount(), 1);
});

test("a revoked TickTick token cannot fail the committed primary article", async t => {
    const f = fixture(t, { connected: true });
    t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 401 }));
    const result = await contentService.createContent({ ...validPayload, projectId: "reading-project", destinations: tickIntent });
    await settle();
    assert.equal(f.persisted.size, 1); assert.equal(f.task.mock.callCount(), 0);
    assert.equal(f.persisted.get(String(result.content._id)).integrations.ticktick.status, "failed");
});

for (const invalid of [{ title: "" }, { rawText: " " }, { title: "a".repeat(501) }, { rawText: "a".repeat(100001) }])
{
    test(`invalid ${Object.keys(invalid)[0]} remains rejected`, async t => {
        const f = fixture(t);
        await assert.rejects(contentService.createContent({ ...validPayload, ...invalid }), { statusCode: 400 });
        assertNoSave(f);
    });
}

test("application user must exist independently of TickTick", async t => {
    const f = fixture(t, { userExists: false });
    await assert.rejects(contentService.createContent(validPayload), { statusCode: 404, message: "User not found" });
    assertNoSave(f);
});

for (const failure of ["syncFails", "updateFails"])
{
    test(`${failure}: committed content survives external synchronization failure`, async t => {
        const f = fixture(t, { connected: true, [failure]: true });
        const result = await contentService.createContent({ ...validPayload, destinations: tickIntent });
        await settle();
        assert.ok(f.persisted.has(String(result.content._id)));
        assert.equal(f.persisted.get(String(result.content._id)).rawText, validPayload.rawText);
        assert.equal(f.task.mock.callCount(), failure === "updateFails" ? 0 : 1);
        assert.ok(f.errors.mock.calls.some(call => call.arguments[0] === "[CONTENT] TickTick synchronization needs attention"));
        assert.ok(!f.events.includes("abort"));
        assert.ok(f.events.includes("end"));
    });
}

for (const failure of ["createFails", "commitFails"])
{
    test(`${failure}: transaction aborts and external sync never starts`, async t => {
        const f = fixture(t, { connected: true, [failure]: true });
        await assert.rejects(contentService.createContent(validPayload), /Database/);
        assert.equal(f.persisted.size, 0);
        assert.equal(f.task.mock.callCount(), 0);
        assert.ok(f.events.includes("abort"));
        assert.equal(f.events.at(-1), "end");
    });
}

function invokeApp({ method = "POST", path = "/api/v1/content", body = {}, token } = {})
{
    return new Promise((resolve, reject) => {
        const req = { method, url: path, socket: { remoteAddress: "127.0.0.1" }, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
        const res = {
            statusCode: 200,
            setHeader() {},
            status(code) { this.statusCode = code; return this; },
            json(data) { resolve({ statusCode: this.statusCode, body: data }); return this; }
        };
        app(req, res, error => error ? reject(error) : reject(new Error("Request did not reach an endpoint")));
    });
}

function authenticatedToken(t)
{
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "phase-2b-test-only-secret";
    t.after(() => {
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    });
    return jwt.sign({ userId: ownerId }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

test("content endpoint rejects unauthenticated requests through parent middleware", async t => {
    const f = fixture(t);
    const res = await invokeApp({ body: validPayload });
    assert.equal(res.statusCode, 401, JSON.stringify(res.body));
    assert.equal(res.body.message, "Missing authorization token");
    assert.equal(f.userLookup.mock.callCount(), 0);
    assert.equal(f.create.mock.callCount(), 0);
});

test("content endpoint rejects invalid tokens before persistence", async t => {
    const f = fixture(t);
    const res = await invokeApp({ body: validPayload, token: "invalid.jwt" });
    assert.equal(res.statusCode, 401, JSON.stringify(res.body));
    assert.equal(f.create.mock.callCount(), 0);
});

test("Google-authenticated save owns content using JWT identity, never body.userId", async t => {
    const f = fixture(t);
    const res = await invokeApp({ token: authenticatedToken(t), body: { ...validPayload, userId: "another-user" } });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, "success");
    assert.equal(res.body.data.content.userId, ownerId);
    assert.equal([...f.persisted.values()][0].userId, ownerId);
    assert.equal(f.task.mock.callCount(), 0);
});

test("content reads retain existing cross-user authorization", async t => {
    const f = fixture(t);
    const res = await invokeApp({ method: "GET", path: "/api/v1/content/user/another-user", token: authenticatedToken(t) });
    assert.equal(res.statusCode, 403, JSON.stringify(res.body));
    assert.equal(f.create.mock.callCount(), 0);
});

test("content reads continue filtering by the authenticated owner", async t => {
    fixture(t);
    const find = t.mock.method(Content, "find", filter => {
        assert.deepEqual(filter, { userId: ownerId });
        return {
            sort(value) { assert.deepEqual(value, { createdAt: -1 }); return this; },
            async select(value) { assert.equal(value, "-__v"); return [{ userId: ownerId, title: "Saved article" }]; }
        };
    });
    const res = await invokeApp({ method: "GET", path: `/api/v1/content/user/${ownerId}`, token: authenticatedToken(t) });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.count, 1);
    assert.equal(find.mock.callCount(), 1);
});


for (const projectId of [null, "reading-project"])
{
    test(`encrypted ConnectedAccount exports to its selected list with legacy projectId ${projectId}`, async t =>
    {
        const f = fixture(t, { encrypted: true, token: "encrypted-only-access-token" });
        const result = await contentService.createContent({ ...validPayload, projectId, destinations: tickIntent });
        await settle();
        assert.equal(f.persisted.size, 1);
        assert.equal(f.task.mock.callCount(), 1);
        assert.equal(f.fetchProjects.mock.callCount(), 1);
        assert.equal(f.persisted.get(String(result.content._id)).integrations.tickTickId, "ticktick-task-1");
    });
}

for (const [ticktick, notion] of [[false, false], [true, false], [false, true], [true, true]])
{
    test(`HTTP save dispatches only requested providers: TickTick=${ticktick} Notion=${notion}`, async t => {
        const f = fixture(t, { connected: true });
        let releaseTick, releaseNotion;
        const tick = t.mock.method(ticktickContentService, "syncContent", async () => new Promise(resolve => { releaseTick = resolve; }));
        const note = t.mock.method(notionContentService, "syncIfSelected", async ({ contentId }) => {
            assert.ok(f.persisted.has(String(contentId)), "provider dispatch follows commit");
            return new Promise(resolve => { releaseNotion = resolve; });
        });
        const res = await invokeApp({ token: authenticatedToken(t), body: { ...validPayload, destinations: { ticktick: ticktick ? { enabled: true, projectId: "reading-project" } : { enabled: false }, notion: { enabled: notion } } } });
        assert.equal(res.statusCode, 201, JSON.stringify(res.body));
        assert.equal(tick.mock.callCount(), Number(ticktick));
        assert.equal(note.mock.callCount(), Number(notion));
        const saved = [...f.persisted.values()][0];
        assert.equal(saved.destinations.ticktick.enabled, ticktick);
        assert.equal(saved.destinations.notion.enabled, notion);
        assert.equal(saved.rawText, validPayload.rawText);
        assert.equal(f.fetchProjects.mock.callCount(), 0);
        releaseTick?.({ status: "synced" }); releaseNotion?.({ status: "synced" });
    });
}

test("legacy projectId and connected credentials cannot activate either provider", async t => {
    const f = fixture(t, { connected: true });
    const notion = t.mock.method(notionContentService, "syncIfSelected", async () => { throw new Error("must not run"); });
    await contentService.createContent({ ...validPayload, projectId: "legacy-project" });
    await settle();
    assert.equal(f.task.mock.callCount(), 0); assert.equal(notion.mock.callCount(), 0);
    assert.equal(f.fetchProjects.mock.callCount(), 0);
});

test("Notion selection validates the authenticated default pointer and refuses a different pointer", async t => {
    const f = fixture(t);
    await assert.rejects(contentService.createContent({ ...validPayload, destinations: { notion: { enabled: true,
        destinationId: "99999999-9999-9999-9999-999999999999", destinationType: "page" } } }), { statusCode: 400 });
    assertNoSave(f);
    assert.equal(notionDestinationService.verify.mock.callCount(), 0);
});

for (const owner of [true, false])
{
    test(`sync-status endpoint is authenticated, read only and ownership-scoped: owns=${owner}`, async t => {
        const f = fixture(t);
        const id = "a".repeat(24);
        const find = t.mock.method(Content, "findOne", filter => ({ select: async () => {
            assert.deepEqual(filter, { _id: id, userId: ownerId });
            return owner ? { _id: id, userId: ownerId, destinations: { ticktick: { enabled: false }, notion: { enabled: false } } } : null;
        } }));
        const path = `/api/v1/content/${id}/sync-status`;
        const unauthenticated = await invokeApp({ method: "GET", path });
        assert.equal(unauthenticated.statusCode, 401); assert.equal(find.mock.callCount(), 0);
        const res = await invokeApp({ method: "GET", path, token: authenticatedToken(t) });
        assert.equal(res.statusCode, owner ? 200 : 404);
        if (owner) { assert.equal(res.body.data.ticktick.status, "not_requested"); assert.equal(res.body.data.notion.status, "not_requested"); }
        assert.equal(f.task.mock.callCount(), 0); assert.equal(f.create.mock.callCount(), 0);
    });
}


test("primary HTTP response does not wait for TickTick list verification network", async t => {
    const f = fixture(t, { connected: true });
    let release;
    t.mock.method(globalThis, "fetch", async () => new Promise(resolve => {
        release = () => resolve({ ok: true, json: async () => [{ id: "reading-project" }] });
    }));
    const res = await invokeApp({ token: authenticatedToken(t), body: { ...validPayload, destinations: tickIntent } });
    assert.equal(res.statusCode, 201); assert.equal(f.persisted.size, 1);
    await settle();
    assert.equal(f.task.mock.callCount(), 0);
    assert.equal(typeof release, "function");
    release(); await settle();
    assert.equal(f.task.mock.callCount(), 1);
});
