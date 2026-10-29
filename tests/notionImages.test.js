import test from "node:test";
import assert from "node:assert/strict";
import { createNotionImageService } from "../services/notionImageService.js";
import notionImages from "../services/notionImageService.js";
import { notionFailure } from "../utils/notionErrors.js";
import { imageFixture, png } from "./helpers/imageFixture.js";
import { fixture, ids } from "./helpers/notionContentFixture.js";

async function imageSyncFixture(retain = true)
{
    const f = imageFixture();
    const asset = await f.upload();
    await f.service.attach({ userId: "owner", contentId: "a".repeat(24), intent: { uploadIds: [asset._id], retain }, notion: true });
    const uploads = new Map();
    const events = [];
    let insertionFailure;
    let sendFailure;
    const api = { request: async input =>
    {
        events.push(input);
        if (input.path === "/file_uploads")
        {
            const id = `${"1".repeat(8)}-${"2".repeat(4)}-${"3".repeat(4)}-${"4".repeat(4)}-${String(uploads.size + 1).padStart(12, "0")}`;
            const result = { object: "file_upload", id, status: "pending", expiry_time: new Date(Date.now() + 3600000).toISOString(), content_type: "image/png", content_length: png.length };
            uploads.set(id, result);
            return { data: { ...result } };
        }
        if (input.path.endsWith("/send"))
        {
            assert.ok(input.body instanceof FormData);
            assert.deepEqual(Buffer.from(await input.body.get("file").arrayBuffer()), png);
            if (sendFailure) { const error = sendFailure; sendFailure = null; throw error; }
            const result = uploads.get(input.path.split("/")[2]);
            result.status = "uploaded";
            return { data: { ...result } };
        }
        if (input.method === "GET") return { data: { ...uploads.get(input.path.split("/")[2]) } };
        if (input.method === "PATCH")
        {
            assert.equal(input.body.children[0].image.type, "file_upload");
            assert.equal(input.path, `/blocks/${ids.created}/children`);
            if (insertionFailure) { const error = insertionFailure; insertionFailure = null; throw error; }
            return { data: { object: "list", results: [{ object: "block", type: "image", id: ids.page }] } };
        }
        throw new Error("Unexpected request");
    } };
    const worker = createNotionImageService({ ...f, api });
    const sync = (ordered = [asset._id]) => worker.sync({ content: { userId: "owner", _id: "a".repeat(24), images: ordered }, pageId: ids.created, connection: {}, deadline: Date.now() + 60000 });
    return { ...f, asset, events, uploads, sync, failInsertion: error => { insertionFailure = error; }, failSend: error => { sendFailure = error; } };
}
test("Notion uses create, multipart send and image-block insertion; repeats skip confirmed work", async () =>
{
    const f = await imageSyncFixture();
    await f.sync();
    assert.deepEqual(f.events.map(event => event.method), ["POST", "POST", "PATCH"]);
    assert.equal(f.asset.notionStatus, "synced");
    assert.equal(f.asset.notionBlockId, ids.page);
    assert.equal(f.blobs.has(f.asset.storageKey), true);
    await f.sync();
    assert.equal(f.events.length, 3);
});
test("temporary image is deleted only after confirmed block insertion", async () =>
{
    const f = await imageSyncFixture(false);
    await f.sync();
    assert.equal(f.asset.notionStatus, "synced");
    assert.equal(f.asset.status, "deleted");
    assert.equal(f.blobs.has(f.asset.storageKey), false);
    await f.sync();
    assert.equal(f.events.length, 3);
});
test("failed insertion reuses the uploaded file; ambiguous insertion never repeats a block", async () =>
{
    const f = await imageSyncFixture(false);
    f.failInsertion(notionFailure("NOTION_RATE_LIMITED"));
    await assert.rejects(f.sync(), error => error.code === "NOTION_IMAGE_FAILED");
    assert.equal(f.asset.notionStatus, "failed");
    assert.equal(f.blobs.has(f.asset.storageKey), true);
    await f.sync();
    assert.equal(f.events.filter(event => event.path === "/file_uploads").length, 1);
    assert.equal(f.events.filter(event => event.path.endsWith("/send")).length, 1);
    const uncertain = await imageSyncFixture(false);
    uncertain.failInsertion(notionFailure("NOTION_PROVIDER_UNAVAILABLE", { ambiguous: true }));
    await assert.rejects(uncertain.sync(), error => error.ambiguous);
    const writes = uncertain.events.length;
    await assert.rejects(uncertain.sync(), error => error.code === "NOTION_SYNC_UNCERTAIN");
    assert.equal(uncertain.events.length, writes);
    assert.equal(uncertain.blobs.has(uncertain.asset.storageKey), true);
});
test("file transfer failure retains the original and resumes the pending upload", async () =>
{
    const f = await imageSyncFixture();
    f.failSend(notionFailure("NOTION_PROVIDER_UNAVAILABLE", { ambiguous: true }));
    await assert.rejects(f.sync(), error => error.code === "NOTION_IMAGE_FAILED" && !error.ambiguous);
    assert.equal(f.blobs.has(f.asset.storageKey), true);
    await f.sync();
    assert.equal(f.events.filter(event => event.path === "/file_uploads").length, 1);
    assert.equal(f.events.filter(event => event.method === "PATCH").length, 1);
});
test("existing Notion claim resumes images after text without recreating its page", async t =>
{
    const f = fixture(t, { content: { images: ["b".repeat(24)] } });
    let calls = 0;
    t.mock.method(notionImages, "validate", async () => {});
    t.mock.method(notionImages, "sync", async () =>
    {
        if (calls++ === 0) throw notionFailure("NOTION_IMAGE_FAILED");
    });
    await assert.rejects(f.sync(), error => error.code === "NOTION_IMAGE_FAILED");
    assert.equal(f.content.integrations.notion.status, "partial");
    assert.equal(f.content.integrations.notion.phase, "images");
    await f.sync();
    assert.equal(f.content.integrations.notion.status, "synced");
    assert.equal(f.requests.filter(request => request.path === "/pages").length, 1);
});

test("Notion inserts images in the explicit saved order", async () =>
{
    const f = await imageSyncFixture();
    f.asset.filename = "first.png";
    const second = await f.upload();
    second.filename = "second.png";
    await f.service.attach({ userId: "owner", contentId: "a".repeat(24), intent: { uploadIds: [second._id], retain: true }, notion: true });
    await f.sync([second._id, f.asset._id]);
    assert.deepEqual(f.events.filter(event => event.path === "/file_uploads").map(event => event.body.filename), ["second.png", "first.png"]);
    assert.equal(f.events.filter(event => event.method === "PATCH").length, 2);
    assert.equal(f.asset.notionStatus, "synced");
    assert.equal(second.notionStatus, "synced");
});

test("expired source images are rejected before a new Notion page is written", async t =>
{
    const f = fixture(t, { content: { images: ["b".repeat(24)] } });
    t.mock.method(notionImages, "validate", async () => { throw notionFailure("NOTION_IMAGE_EXPIRED"); });
    const sync = t.mock.method(notionImages, "sync", async () => {});
    await assert.rejects(f.sync(), error => error.code === "NOTION_IMAGE_EXPIRED");
    assert.equal(f.writes().length, 0);
    assert.equal(sync.mock.callCount(), 0);
});

test("browser source metadata reaches the existing image phase without changing original text", async t =>
{
    const f = fixture(t, { content: { url: "chrome://extensions/", rawText: "Original readable note.", images: ["b".repeat(24)] } });
    t.mock.method(notionImages, "validate", async () => {});
    const images = t.mock.method(notionImages, "sync", async input =>
    {
        assert.equal(input.content.rawText, "Original readable note.");
        assert.equal(input.pageId, ids.created);
    });
    await f.sync();
    assert.equal(images.mock.callCount(), 1);
    assert.equal(f.content.integrations.notion.phase, "complete");
    assert.equal(f.content.integrations.notion.status, "synced");
});

test("retained-only images never enter Notion validation or insertion", async t =>
{
    const f = fixture(t, { content: { images: ["b".repeat(24)], imageNotionIncluded: false } });
    const validate = t.mock.method(notionImages, "validate", async () => { throw new Error("Not requested"); });
    const sync = t.mock.method(notionImages, "sync", async () => { throw new Error("Not requested"); });
    await f.sync();
    assert.equal(validate.mock.callCount(), 0);
    assert.equal(sync.mock.callCount(), 0);
    assert.equal(f.content.integrations.notion.status, "synced");
});

test("a file reported as already attached is uncertain rather than inserted again", async () =>
{
    const f = await imageSyncFixture(false);
    f.failInsertion(notionFailure("NOTION_RATE_LIMITED"));
    await assert.rejects(f.sync());
    f.uploads.get(f.asset.notionUploadId).expiry_time = null;
    await assert.rejects(f.sync(), error => error.code === "NOTION_SYNC_UNCERTAIN");
    assert.equal(f.events.filter(event => event.method === "PATCH").length, 1);
    assert.equal(f.asset.notionStatus, "uncertain");
    assert.equal(f.blobs.has(f.asset.storageKey), true);
});
