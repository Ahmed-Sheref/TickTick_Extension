import ImageAsset from "../Models/ImageAsset.js";
import storage from "./imageStorageService.js";
import notionApi from "../utils/notionApi.js";
import { notionId } from "../validators/notionValidator.js";
import { notionFailure } from "../utils/notionErrors.js";

export function createNotionImageService({ Asset = ImageAsset, objects = storage, api = notionApi } = {})
{
    const validate = async ({ content }) =>
    {
        for (const id of content.images || [])
        {
            const asset = await Asset.findOne({ _id: id, userId: content.userId, contentId: content._id });
            if (asset?.notionStatus === "synced") continue;
            if (!asset || asset.status !== "attached" || !asset.retained && asset.expiresAt <= new Date())
                throw notionFailure("NOTION_IMAGE_EXPIRED");
            if (["inserting", "uncertain"].includes(asset.notionStatus))
                throw notionFailure("NOTION_SYNC_UNCERTAIN", { ambiguous: true });
        }
    };
    const sync = async ({ content, pageId, connection, deadline }) =>
    {
        for (const imageId of content.images || [])
        {
            const owner = { _id: imageId, userId: content.userId, contentId: content._id };
            let asset = await Asset.findOne(owner).select("+storageKey");
            if (!asset) throw notionFailure("NOTION_IMAGE_FAILED");
            if (asset.notionStatus === "synced") continue;
            if (["inserting", "uncertain"].includes(asset.notionStatus)) throw notionFailure("NOTION_SYNC_UNCERTAIN", { ambiguous: true });
            if (asset.status !== "attached" || !asset.retained && asset.expiresAt <= new Date()) throw notionFailure("NOTION_IMAGE_FAILED");
            const persist = async values =>
            {
                const updated = await Asset.findOneAndUpdate({ ...owner, status: "attached" }, { $set: { ...values, operationAt: new Date() } }, { new: true });
                if (!updated) throw notionFailure("NOTION_PERSISTENCE_FAILED");
                Object.assign(asset, values);
            };
            const request = async (method, path, body) => (await api.request({ userId: content.userId, method, path, body, connection, deadline })).data;
            let insertionMayHaveCommitted = false;
            let inserting = false;
            try
            {
                // Upload failures are recoverable without repeating a page/block write.
                await persist({ notionStatus: "uploading", errorCode: null });
                let upload;
                if (asset.notionUploadId)
                {
                    try
                    {
                        upload = await request("GET", `/file_uploads/${asset.notionUploadId}`);
                        if (upload.object !== "file_upload" || notionId(upload.id) !== asset.notionUploadId ||
                            upload.expiry_time === undefined || upload.expiry_time !== null && !Number.isFinite(new Date(upload.expiry_time).getTime()))
                            throw notionFailure("NOTION_INVALID_RESPONSE");
                        if (upload.status === "uploaded" && upload.expiry_time === null)
                            throw notionFailure("NOTION_SYNC_UNCERTAIN", { ambiguous: true });
                    }
                    catch (error)
                    {
                        if (error.code !== "NOTION_RESOURCE_NOT_FOUND") throw error;
                    }
                }
                if (!upload || !["pending", "uploaded"].includes(upload.status) || upload.archived || new Date(upload.expiry_time) <= new Date())
                {
                    upload = await request("POST", "/file_uploads", { mode: "single_part", filename: asset.filename, content_type: asset.mimeType });
                    const expires = new Date(upload.expiry_time);
                    if (upload.object !== "file_upload" || !notionId(upload.id) || upload.status !== "pending" || !Number.isFinite(expires.getTime()) || expires <= new Date())
                        throw notionFailure("NOTION_INVALID_RESPONSE");
                    await persist({ notionUploadId: notionId(upload.id), notionUploadExpiresAt: expires });
                }
                if (upload.status !== "uploaded")
                {
                    const { bytes } = await objects.read(asset.storageKey);
                    const form = new FormData();
                    form.append("file", new Blob([bytes], { type: asset.mimeType }), asset.filename);
                    upload = await request("POST", `/file_uploads/${asset.notionUploadId}/send`, form);
                }
                if (upload.object !== "file_upload" || notionId(upload.id) !== asset.notionUploadId || upload.status !== "uploaded" ||
                    Number(upload.content_length) !== asset.size || upload.content_type !== asset.mimeType)
                    throw notionFailure("NOTION_INVALID_RESPONSE");
                await persist({ notionStatus: "uploaded" });
                // Persist before the write. A crash from this point requires
                // reconciliation, never an automatic duplicate image insertion.
                await persist({ notionStatus: "inserting" });
                inserting = true;
                const result = await request("PATCH", `/blocks/${pageId}/children`,
                {
                    children: [{ object: "block", type: "image", image: { type: "file_upload", file_upload: { id: asset.notionUploadId } } }]
                });
                insertionMayHaveCommitted = true;
                if (result.object !== "list" || result.results?.length !== 1 || result.results[0].object !== "block" ||
                    result.results[0].type !== "image" || !notionId(result.results[0].id))
                    throw notionFailure("NOTION_INVALID_RESPONSE", { ambiguous: true });
                await persist({ notionStatus: "synced", notionBlockId: notionId(result.results[0].id), errorCode: null });
                insertionMayHaveCommitted = false;
            }
            catch (error)
            {
                const uncertain = insertionMayHaveCommitted || inserting && error.ambiguous || error.code === "NOTION_SYNC_UNCERTAIN";
                try
                {
                    await persist({ notionStatus: uncertain ? "uncertain" : "failed", errorCode: "NOTION_IMAGE_FAILED" });
                }
                catch
                {
                    console.error("[IMAGES] Notion image state persistence needs attention");
                }
                throw notionFailure(uncertain ? "NOTION_SYNC_UNCERTAIN" : "NOTION_IMAGE_FAILED", { ambiguous: uncertain });
            }
            if (!asset.retained)
            {
                // Deletion failure does not undo confirmed Notion success;
                // the cleanup job retries removal of the temporary object.
                try
                {
                    await objects.remove(asset.storageKey);
                    await Asset.updateOne(owner, { $set: { status: "deleted" } });
                }
                catch
                {
                    console.error("[IMAGES] Temporary image deletion needs attention", String(imageId));
                }
            }
        }
    };
    return { validate, sync };
}
export default createNotionImageService();
