import ImageUploadQuota from "../Models/ImageUploadQuota.js";
import { imageUsage, imageStorageBudgets } from "./imageUsageService.js";
import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import ImageAsset from "../Models/ImageAsset.js";
import Content from "../Models/Content.js";
import storage from "./imageStorageService.js";
import { imageError, imageId, imageLimits, imagePolicy, imageSignature, validateImageMetadata } from "./imageConfig.js";

export function imageIntent(payload)
{
    if (payload.images === undefined) return null;
    const input = payload.images;
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["uploadIds", "retain", "notion"].includes(key)) ||
        input.notion !== undefined && typeof input.notion !== "boolean" ||
        input.retain !== undefined && typeof input.retain !== "boolean" || !Array.isArray(input.uploadIds) || !input.uploadIds.length ||
        input.uploadIds.length > imageLimits.maximum || input.uploadIds.some(id => !imageId(id)) || new Set(input.uploadIds.map(id => id.toLowerCase())).size !== input.uploadIds.length)
        throw imageError("Invalid image selection or retention choice.");
    const notion = input.notion ?? payload.destinations?.notion?.enabled === true;
    const retain = input.retain ?? true;
    if (notion && payload.destinations?.notion?.enabled !== true) throw imageError("Select Notion before including images there.");
    if (!retain && !notion)
        throw imageError("Choose Notion or keep a copy of the images in Knowvia.");
    return { retain, notion, uploadIds: input.uploadIds.map(id => id.toLowerCase()) };
}
export const imageMetadata = asset => (
{
    id: String(asset._id), filename: asset.filename, mimeType: asset.mimeType, size: asset.size,
    retained: asset.retained, status: asset.status, notionStatus: asset.notionStatus
});

export function createImageAssetService({ Asset = ImageAsset, ContentModel = Content, objects = storage, Quota = ImageUploadQuota,
    usage = userId => imageUsage({ Asset, userId }) } = {})
{
    let quotaIndexes;
    const owned = async (userId, id) =>
    {
        if (!imageId(id)) throw imageError("Image not found.", 404);
        const asset = await Asset.findOne({ _id: id, userId }).select("+storageKey +stagingKey +sha256");
        if (!asset) throw imageError("Image not found.", 404);
        return asset;
    };
    const initiate = async (userId, input) =>
    {
        const metadata = validateImageMetadata(input);
        const budgets = imageStorageBudgets();
        const [account, global] = await Promise.all([usage(userId), usage()]);
        if (account.reservedBytes + 2 * metadata.size > budgets.userBytes || global.reservedBytes + 2 * metadata.size > budgets.globalBytes)
            throw imageError("Image storage limit reached. Remove unused images or try again later.", 429);
        // A bounded account backlog complements the authenticated route limiter.
        if (await Asset.countDocuments({ userId, status: { $ne: "deleted" } }) >= 1000)
            throw imageError("Image storage quota reached. Delete unused images first.", 429);
        quotaIndexes ||= Quota.createIndexes().catch(error => { quotaIndexes = null; throw error; });
        await quotaIndexes;
        try
        {
            const quota = await Quota.findOneAndUpdate({ userId, day: new Date().toISOString().slice(0, 10), count: { $lt: imagePolicy().dailyUploads } },
                { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 8 * 86400000) } }, { upsert: true, new: true });
            if (!quota) throw imageError("Daily image upload limit reached.", 429);
        }
        catch (error)
        {
            if (error.code === 11000) throw imageError("Daily image upload limit reached.", 429);
            throw error;
        }
        const id = new mongoose.Types.ObjectId();
        const scope = createHash("sha256").update(userId).digest("hex");
        const prefix = `images/${scope}/${id}/${randomUUID()}`;
        const policy = imagePolicy();
        const upload = await objects.authorize(`${prefix}/staging`, metadata.mimeType, metadata.size);
        const asset = await Asset.create({ _id: id, userId, ...metadata, stagingKey: `${prefix}/staging`, storageKey: `${prefix}/verified`,
            uploadExpiresAt: new Date(Date.now() + policy.uploadSeconds * 1000), expiresAt: new Date(Date.now() + policy.abandonedSeconds * 1000) });
        return { uploadId: String(asset._id), ...upload, expiresAt: asset.uploadExpiresAt };
    };
    const complete = async (userId, id) =>
    {
        const asset = await owned(userId, id);
        if (["uploaded", "attached"].includes(asset.status)) return imageMetadata(asset);
        if (asset.expiresAt <= new Date() || asset.uploadExpiresAt <= new Date()) throw imageError("Upload expired. Select the image again.", 410);
        const locked = await Asset.findOneAndUpdate({ _id: id, userId, status: "uploading" }, { $set: { status: "verifying", operationAt: new Date() } }, { new: true });
        if (!locked) throw imageError("Image verification is already in progress.", 409);
        try
        {
            const { bytes, sha256 } = await objects.read(asset.stagingKey);
            if (bytes.length !== asset.size || imageSignature(bytes) !== asset.mimeType) throw imageError("Image size or type did not match the upload.");
            await objects.seal(asset.storageKey, bytes, asset.mimeType);
            const verified = await Asset.findOneAndUpdate({ _id: id, userId, status: "verifying" },
                { $set: { status: "uploaded", sha256 } }, { new: true });
            if (!verified) throw imageError("Image verification could not be confirmed.", 409);
            return imageMetadata(verified);
        }
        catch (error)
        {
            await Asset.updateOne({ _id: id, userId, status: "verifying" }, { $set: { status: "uploading" } });
            if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404)
                throw imageError("The upload is missing. Upload the image again.", 410);
            if (error.statusCode) throw error;
            throw imageError("Could not verify the uploaded image. Upload it again.", 503);
        }
    };
    const attach = async ({ userId, contentId, intent, notion, session }) =>
    {
        if (!intent) return [];
        const ids = [];
        // All claims participate in the existing content transaction. A second
        // save cannot consume an image already committed to a different item.
        for (const id of intent.uploadIds)
        {
            const asset = await Asset.findOneAndUpdate({ _id: id, userId, status: "uploaded", contentId: null, expiresAt: { $gt: new Date() } },
                { $set: { status: "attached", contentId, retained: intent.retain,
                    notionStatus: notion ? "pending" : "not_requested",
                    expiresAt: new Date(Date.now() + imagePolicy().recoverySeconds * 1000) } }, { new: true, session });
            if (!asset) throw imageError("An image is expired, unverified, or already used. Check the image selection.", 409);
            ids.push(asset._id);
        }
        return ids;
    };
    const list = async (userId, contentId) =>
    {
        if (!imageId(contentId) || !await ContentModel.exists({ _id: contentId, userId })) throw imageError("Content not found.", 404);
        const assets = await Asset.find({ userId, contentId, retained: true, status: "attached" }).select("+storageKey");
        return Promise.all(assets.map(async asset => ({ ...imageMetadata(asset), displayUrl: await objects.display(asset.storageKey), expiresIn: imagePolicy().downloadSeconds })));
    };
    const remove = async (userId, id) =>
    {
        const asset = await owned(userId, id);
        if (asset.status === "deleted") return;
        if (asset.contentId && !await ContentModel.exists({ _id: asset.contentId, userId })) throw imageError("Content not found.", 404);
        if (asset.contentId && !["not_requested", "synced"].includes(asset.notionStatus))
            throw imageError("This image is needed for Notion recovery. Complete synchronization before deleting it.", 409);
        if (["verifying", "uploading", "inserting"].includes(asset.notionStatus) || asset.status === "verifying") throw imageError("Image is in use.", 409);
        const claimed = await Asset.findOneAndUpdate({ _id: id, userId, status: { $in: ["uploading", "uploaded", "attached", "deleting"] }, notionStatus: asset.notionStatus }, { $set: { status: "deleting", retained: false } }, { new: true });
        if (!claimed) throw imageError("Image state changed. Refresh and retry.", 409);
        // Keep the tombstone until cleanup can also remove any late staging PUT.
        await objects.remove(asset.storageKey);
        await objects.remove(asset.stagingKey);
        await Asset.updateOne({ _id: id, userId, status: "deleting" }, { $set: { status: "deleted" } });
    };
    return { initiate, complete, attach, list, remove, usage: async userId => ({ ...await usage(userId), limitBytes: imageStorageBudgets().userBytes }) };
}
export default createImageAssetService();
