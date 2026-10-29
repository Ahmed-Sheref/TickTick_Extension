import ImageAsset from "../Models/ImageAsset.js";
import storage from "./imageStorageService.js";

export function createImageCleanupService({ Asset = ImageAsset, objects = storage } = {})
{
    return async () =>
    {
        const now = new Date();
        // Staging objects can be recreated until the signed PUT expires. Only
        // mark staging clean after that capability has expired (with clock slack).
        const staging = await Asset.find({ stagingCleaned: false, uploadExpiresAt: { $lt: new Date(now.getTime() - 60000) } })
            .select("+stagingKey").limit(100);
        for (const asset of staging)
        {
            try
            {
                await objects.remove(asset.stagingKey);
                await Asset.updateOne({ _id: asset._id }, { $set: { stagingCleaned: true } });
            }
            catch
            {
                console.error("[IMAGES] Staging cleanup failed", String(asset._id));
            }
        }
        const expired = await Asset.find({ retained: false, status: { $in: ["uploading", "uploaded", "attached", "deleting", "verifying"] },
            $or: [{ expiresAt: { $lt: now } }, { notionStatus: "synced" }, { status: "deleting" }] }).select("+storageKey").limit(100);
        for (const asset of expired)
        {
            try
            {
                // Atomic state/retention guard competes safely with attachment
                // transactions and active image synchronization.
                const claimed = await Asset.findOneAndUpdate({ _id: asset._id, retained: false, status: asset.status,
                    notionStatus: asset.notionStatus, operationAt: asset.operationAt ?? null,
                    $or: [{ operationAt: { $lt: new Date(now.getTime() - 120000) } }, { operationAt: null }] },
                    { $set: { status: "deleting", errorCode: asset.notionStatus === "synced" ? null : "IMAGE_EXPIRED" } }, { new: true });
                if (!claimed) continue;
                await objects.remove(asset.storageKey);
                await Asset.updateOne({ _id: asset._id, status: "deleting", retained: false }, { $set: { status: "deleted" } });
            }
            catch
            {
                console.error("[IMAGES] Temporary image cleanup failed", String(asset._id));
            }
        }
    };
}
export default createImageCleanupService();
