import ImageUploadQuota from "../Models/ImageUploadQuota.js";
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import ImageAsset from "../Models/ImageAsset.js";
import Content from "../Models/Content.js";
import { createImageAssetService } from "../services/imageAssetService.js";
import { imageFixture, png } from "./helpers/imageFixture.js";

const uri = process.env.IMAGE_TEST_MONGODB_URI;
test("Mongo image association commits atomically and rejects cross-owner/repeated consumption", { skip: !uri }, async () =>
{
    const database = new URL(uri).pathname.slice(1);
    assert.match(database, /^knowvia_image_test_[a-zA-Z0-9_-]+$/, "Use a dedicated knowvia_image_test_* replica-set database");
    const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
    const Asset = connection.model("ImageAsset", ImageAsset.schema);
    const Quota = connection.model("ImageUploadQuota", ImageUploadQuota.schema);
    const ContentModel = connection.model("Content", Content.schema);
    const userId = `image-test-${randomUUID()}`;
    const { objects, blobs } = imageFixture();
    const assets = createImageAssetService({ Asset, ContentModel, objects, Quota });
    let session;
    try
    {
        const upload = await assets.initiate(userId, { filename: "image.png", mimeType: "image/png", size: png.length });
        const asset = await Asset.findById(upload.uploadId).select("+stagingKey");
        blobs.set(asset.stagingKey, png);
        await assets.complete(userId, upload.uploadId);
        session = await connection.startSession();
        await assert.rejects(session.withTransaction(async () =>
        {
            const [rolledBack] = await ContentModel.create([{ userId, title: "Rollback", rawText: "Preserved" }], { session });
            await assets.attach({ userId, contentId: rolledBack._id, intent: { uploadIds: [upload.uploadId], retain: true }, notion: false, session });
            throw new Error("Intentional test rollback");
        }), /Intentional test rollback/);
        assert.equal((await Asset.findById(upload.uploadId)).status, "uploaded");
        assert.equal(await ContentModel.countDocuments({ userId }), 0);
        let saved;
        await session.withTransaction(async () =>
        {
            [saved] = await ContentModel.create([{ userId, title: "Saved with image", rawText: "Original unchanged", imageRetention: true }], { session });
            saved.images = await assets.attach({ userId, contentId: saved._id, intent: { uploadIds: [upload.uploadId], retain: true }, notion: false, session });
            await saved.save({ session });
        });
        assert.equal((await assets.list(userId, String(saved._id))).length, 1);
        await assert.rejects(assets.list("other-user", String(saved._id)), error => error.statusCode === 404);
        await assert.rejects(assets.attach({ userId, contentId: new mongoose.Types.ObjectId(), intent: { uploadIds: [upload.uploadId], retain: true } }), error => error.statusCode === 409);
        await assets.remove(userId, upload.uploadId);
        assert.equal((await assets.list(userId, String(saved._id))).length, 0);
    }
    finally
    {
        await session?.endSession();
        await Quota.deleteMany({ userId });
        await Asset.deleteMany({ userId });
        await ContentModel.deleteMany({ userId });
        await connection.close();
    }
});
