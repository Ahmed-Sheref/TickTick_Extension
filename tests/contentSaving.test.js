import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import axios from "axios";
import jwt from "jsonwebtoken";
import User from "../Models/User.js";
import Content from "../Models/Content.js";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import { encryptProviderToken } from "../utils/providerTokenEncryption.js";

// Loading the existing AI module requires a key, even when AI is disabled.
// Use a test-only placeholder rather than loading developer credentials.
const previousGroqKey = process.env.GROQ_API_KEY;
process.env.GROQ_API_KEY = "test-only-no-external-requests";
const { default: contentService } = await import("../services/contentService.js");
const { default: app } = await import("../index.js");
if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
else process.env.GROQ_API_KEY = previousGroqKey;

const ownerId = "USER_existing_google_user";
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
    const update = t.mock.method(Content, "findByIdAndUpdate", async (id, changes) => {
        events.push("integration-update");
        if (updateFails) throw new Error("Integration metadata update failed");
        const document = persisted.get(String(id));
        assert.ok(document);
        document.integrations.tickTickId = changes.$set["integrations.tickTickId"];
    });
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
    test(`connected user retains automatic sync ${projectId ? "to the selected project" : "without selecting a project"}`, async t => {
        const f = fixture(t, { connected: true });
        const result = await contentService.createContent({ ...validPayload, projectId });
        assert.equal(f.persisted.size, 1);
        assert.equal(f.task.mock.callCount(), 1);
        assert.equal(f.fetchProjects.mock.callCount(), projectId ? 1 : 0);
        const taskPayload = f.task.mock.calls[0].arguments[1];
        assert.equal(taskPayload.projectId, projectId);
        assert.equal(taskPayload.title, validPayload.title);
        assert.equal(taskPayload.content, validPayload.rawText);
        assert.deepEqual(taskPayload.tags, ["nodejs", "express"]);
        assert.equal(taskPayload.kind, "NOTE");
        assert.equal(f.persisted.get(String(result.content._id)).integrations.tickTickId, "ticktick-task-1");
        assert.ok(f.events.indexOf("commit") < f.events.indexOf("sync"));
        assert.ok(!f.events.includes("abort"));
    });
}

for (const connection of [
    { connected: false, token: null },
    { connected: true, token: null },
    { connected: false, token: "stale-token" }
])
{
    test(`project selection rejects incomplete TickTick connection ${JSON.stringify(connection)}`, async t => {
        const f = fixture(t, connection);
        await assert.rejects(contentService.createContent({ ...validPayload, projectId: "reading-project" }),
            { statusCode: 401, message: "TickTick account is not connected" });
        assertNoSave(f);
        assert.equal(f.fetchProjects.mock.callCount(), 0);
    });
}

test("nonexistent TickTick project is rejected before persistence", async t => {
    const f = fixture(t, { connected: true });
    await assert.rejects(contentService.createContent({ ...validPayload, projectId: "missing-project" }),
        { statusCode: 400, message: "Selected TickTick project no longer exists" });
    assertNoSave(f);
    assert.equal(f.fetchProjects.mock.callCount(), 1);
});

test("rejected TickTick access token prevents saving to a selected project", async t => {
    const f = fixture(t, { connected: true });
    t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 401 }));
    await assert.rejects(contentService.createContent({ ...validPayload, projectId: "reading-project" }),
        /Failed to fetch TickTick projects/);
    assertNoSave(f);
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
        const result = await contentService.createContent(validPayload);
        assert.ok(f.persisted.has(String(result.content._id)));
        assert.equal(f.persisted.get(String(result.content._id)).rawText, validPayload.rawText);
        assert.equal(f.task.mock.callCount(), 1);
        assert.ok(f.errors.mock.calls.some(call => call.arguments[0] === "[CONTENT] TickTick sync failed"));
        assert.ok(!f.events.includes("abort"));
        assert.equal(f.events.at(-1), "end");
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
    test(`encrypted ConnectedAccount supports saving and sync ${projectId ? "to a selected project" : "without a project"}`, async t =>
    {
        const f = fixture(t, { encrypted: true, token: "encrypted-only-access-token" });
        const result = await contentService.createContent({ ...validPayload, projectId });
        assert.equal(f.persisted.size, 1);
        assert.equal(f.task.mock.callCount(), 1);
        assert.equal(f.fetchProjects.mock.callCount(), projectId ? 1 : 0);
        assert.equal(f.persisted.get(String(result.content._id)).integrations.tickTickId, "ticktick-task-1");
    });
}
