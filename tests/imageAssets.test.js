import test from "node:test";
import assert from "node:assert/strict";
import { imageIntent, imageMetadata } from "../services/imageAssetService.js";
import { imageSignature, validateImageMetadata, imageLimits } from "../services/imageConfig.js";
import { createImageCleanupService } from "../services/imageCleanupService.js";
import { createImageAssetService } from "../services/imageAssetService.js";
import { imageStorageBudgets } from "../services/imageUsageService.js";
import { imageFixture, png } from "./helpers/imageFixture.js";

test("image metadata, signatures and bounded retention intent reject unsupported input", () =>
{
    assert.equal(validateImageMetadata({ filename: "photo.png", size: png.length, mimeType: "image/png" }).size, png.length);
    for (const input of [{ filename: "bad.svg", size: 1, mimeType: "image/svg+xml" }, { filename: "../a.png", size: 1, mimeType: "image/png" },
        { filename: "a.png", size: imageLimits.sizeLimit + 1, mimeType: "image/png" }, { filename: "a.png", size: 0, mimeType: "image/png" }]) assert.throws(() => validateImageMetadata(input));
    assert.equal(imageSignature(png), "image/png");
    assert.equal(imageSignature(Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(4)])), "image/gif");
    assert.equal(imageSignature(Buffer.concat([Buffer.from([255,216,255]), Buffer.alloc(9)])), "image/jpeg");
    assert.equal(imageSignature(Buffer.from("RIFF0000WEBPVP8X")), "image/webp");
    assert.throws(() => imageSignature(Buffer.from("<svg>not an image</svg>")));
    const id = "a".repeat(24);
    for (const images of [{ retain: "true", uploadIds: [id] }, { retain: false, uploadIds: [id] }, { retain: true, uploadIds: [id,id] }, { retain: true, uploadIds: Array(7).fill(id) }, { retain: true, uploadIds: ["storage/key"] }])
        assert.throws(() => imageIntent({ images }));
    assert.equal(imageIntent({ images: { retain: false, uploadIds: [id] }, destinations: { notion: { enabled: true } } }).retain, false);
    assert.equal(imageIntent({}), null);
});
test("completion verifies bytes, is idempotent and seals against late client overwrite", async () =>
{
    const f = imageFixture();
    const record = await f.upload();
    const result = await f.service.complete("owner", record._id);
    assert.equal(result.status, "uploaded");
    f.blobs.set(record.stagingKey, Buffer.from("overwritten"));
    assert.deepEqual(f.blobs.get(record.storageKey), png);
    assert.equal(JSON.stringify(result).includes("storageKey"), false);
    assert.equal(imageMetadata(record).filename, "image.png");
});

test("Notion image inclusion and Knowvia retention are independent explicit intents", () =>
{
    const uploadIds = ["a".repeat(24)];
    const destinations = { notion: { enabled: true } };
    assert.equal(imageIntent({ destinations, images: { uploadIds, retain: true, notion: false } }).notion, false);
    assert.equal(imageIntent({ destinations, images: { uploadIds, retain: false, notion: true } }).notion, true);
    assert.throws(() => imageIntent({ destinations, images: { uploadIds, retain: false, notion: false } }));
    assert.throws(() => imageIntent({ images: { uploadIds, retain: true, notion: true } }));
    assert.throws(() => imageIntent({ destinations, images: { uploadIds, retain: true, notion: "false" } }));
});
test("completion rejects another owner, missing object, expiry, size and signature mismatch", async () =>
{
    const f = imageFixture();
    const result = await f.service.initiate("owner", { filename: "a.png", size: png.length, mimeType: "image/png" });
    const record = f.records.get(result.uploadId);
    await assert.rejects(f.service.complete("other", record._id), error => error.statusCode === 404);
    await assert.rejects(f.service.complete("owner", record._id), error => error.statusCode === 410);
    f.blobs.set(record.stagingKey, Buffer.alloc(png.length));
    await assert.rejects(f.service.complete("owner", record._id), /supported image/);
    f.blobs.set(record.stagingKey, png.subarray(0, 20));
    await assert.rejects(f.service.complete("owner", record._id), /size or type/);
    record.uploadExpiresAt = new Date(0);
    await assert.rejects(f.service.complete("owner", record._id), error => error.statusCode === 410);
    assert.equal(record.status, "uploading");
});
test("attachment consumes verified uploads once, binds owner and retains securely", async () =>
{
    const f = imageFixture();
    const record = await f.upload();
    const intent = { uploadIds: [record._id], retain: true };
    await assert.rejects(f.service.attach({ userId: "other", contentId: "a".repeat(24), intent }), /expired, unverified/);
    const attached = await f.service.attach({ userId: "owner", contentId: "a".repeat(24), intent, notion: false, session: {} });
    assert.deepEqual(attached, [record._id]);
    assert.equal(record.retained, true);
    await assert.rejects(f.service.attach({ userId: "owner", contentId: "b".repeat(24), intent }), /already used/);
    const listing = await f.service.list("owner", "a".repeat(24));
    assert.equal(listing.length, 1);
    assert.ok(listing[0].displayUrl.startsWith("https://"));
    assert.equal(Object.hasOwn(listing[0], "storageKey"), false);
    await assert.rejects(f.service.list("other", "a".repeat(24)), error => error.statusCode === 404);
    await assert.rejects(f.service.remove("other", record._id), error => error.statusCode === 404);
    await f.service.remove("owner", record._id);
    assert.equal(record.status, "deleted");
    assert.equal(f.blobs.has(record.storageKey), false);
    assert.equal((await f.service.list("owner", "a".repeat(24))).length, 0);
});
test("temporary Notion assets cannot be deleted during recovery; cleanup preserves retained and active images", async () =>
{
    const f = imageFixture();
    const temporary = await f.upload();
    await f.service.attach({ userId: "owner", contentId: "a".repeat(24), intent: { uploadIds: [temporary._id], retain: false }, notion: true });
    await assert.rejects(f.service.remove("owner", temporary._id), /needed for Notion recovery/);
    const permanent = await f.upload();
    await f.service.attach({ userId: "owner", contentId: "a".repeat(24), intent: { uploadIds: [permanent._id], retain: true }, notion: true });
    temporary.expiresAt = permanent.expiresAt = new Date(0);
    temporary.operationAt = new Date();
    const cleanup = createImageCleanupService(f);
    await cleanup();
    assert.equal(temporary.status, "attached");
    temporary.operationAt = new Date(0);
    await cleanup();
    assert.equal(temporary.status, "deleted");
    assert.equal(permanent.status, "attached");
    assert.equal(f.blobs.has(permanent.storageKey), true);
});
test("abandoned uploads and late staging PUTs are cleaned only after authorization expires", async () =>
{
    const f = imageFixture();
    const record = await f.upload();
    const cleanup = createImageCleanupService(f);
    await f.service.remove("owner", record._id);
    f.blobs.set(record.stagingKey, png);
    await cleanup();
    assert.equal(f.blobs.has(record.stagingKey), true);
    record.uploadExpiresAt = new Date(0);
    await cleanup();
    assert.equal(f.blobs.has(record.stagingKey), false);
    assert.equal(record.stagingCleaned, true);
});

test("cleanup retries object-store failures without touching permanent assets", async () =>
{
    const f = imageFixture();
    const temporary = await f.upload();
    const permanent = await f.upload();
    await f.service.attach({ userId: "owner", contentId: "a".repeat(24), intent: { uploadIds: [permanent._id], retain: true }, notion: false });
    temporary.expiresAt = new Date(0);
    temporary.operationAt = new Date(0);
    const remove = f.objects.remove;
    f.objects.remove = async () => { throw new Error("storage unavailable"); };
    const cleanup = createImageCleanupService(f);
    await cleanup();
    assert.equal(temporary.status, "deleting");
    assert.equal(permanent.status, "attached");
    f.objects.remove = remove;
    await cleanup();
    assert.equal(temporary.status, "deleted");
    assert.equal(f.blobs.has(permanent.storageKey), true);
});

test("simultaneous completion has one verification owner", async () =>
{
    const f = imageFixture();
    const upload = await f.service.initiate("owner", { filename: "a.png", mimeType: "image/png", size: png.length });
    const asset = f.records.get(upload.uploadId);
    f.blobs.set(asset.stagingKey, png);
    const results = await Promise.allSettled([f.service.complete("owner", asset._id), f.service.complete("owner", asset._id)]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.filter(result => result.status === "rejected" && result.reason.statusCode === 409).length, 1);
    assert.equal(asset.status, "uploaded");
});

test("durable daily upload quota rejects concurrent excess authorization", async () =>
{
    const f = imageFixture();
    f.quotas.set(`owner:${new Date().toISOString().slice(0,10)}`, 119);
    const results = await Promise.allSettled([1,2,3].map(() => f.service.initiate("owner", { filename: "a.png", mimeType: "image/png", size: png.length })));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.filter(result => result.status === "rejected" && result.reason.statusCode === 429).length, 2);
    assert.equal(f.records.size, 1);
});

test("modern image intent defaults to retained Knowvia images while explicit legacy temporary intent stays compatible", () =>
{
    const uploadIds = ["a".repeat(24)];
    assert.equal(imageIntent({ images: { uploadIds, notion: false } }).retain, true);
    assert.equal(imageIntent({ destinations: { notion: { enabled: true } }, images: { uploadIds, retain: false } }).retain, false);
});

test("server admission checks per-user and global reserved bytes before issuing an upload", async () =>
{
    const budgets = imageStorageBudgets();
    for (const scope of ["user", "global"])
    {
        const f = imageFixture();
        const service = createImageAssetService({ ...f, usage: async userId => ({ retainedBytes: 0, assets: 0,
            reservedBytes: scope === "user" && userId ? budgets.userBytes : scope === "global" && !userId ? budgets.globalBytes : 0 }) });
        await assert.rejects(service.initiate("owner", { filename: "a.png", mimeType: "image/png", size: png.length }), error => error.statusCode === 429);
        assert.equal(f.records.size, 0);
        assert.equal(f.quotas.size, 0);
    }
});

test("owned usage counts retained bytes and late staging reservations until cleanup succeeds", async () =>
{
    const f = imageFixture();
    const asset = await f.upload();
    await f.service.attach({ userId: "owner", contentId: "a".repeat(24), intent: { uploadIds: [asset._id], retain: true }, notion: false });
    const before = await f.service.usage("owner");
    assert.equal(before.retainedBytes, png.length);
    assert.equal(before.reservedBytes, 2 * png.length);
    assert.equal((await f.service.usage("other")).reservedBytes, 0);
    await f.service.remove("owner", asset._id);
    assert.equal((await f.service.usage("owner")).reservedBytes, png.length);
    asset.stagingCleaned = true;
    assert.equal((await f.service.usage("owner")).reservedBytes, 0);
});
