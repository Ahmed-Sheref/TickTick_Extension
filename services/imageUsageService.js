import ImageAsset from "../Models/ImageAsset.js";

// Account for verified bytes and still-live staging capabilities. Upload
// sessions reserve their declared size even before the client sends the file.
export async function imageUsage({ Asset = ImageAsset, userId } = {})
{
    const [usage] = await Asset.aggregate([
        { $match: { ...(userId ? { userId } : {}), $or: [{ status: { $ne: "deleted" } }, { stagingCleaned: { $ne: true } }] } },
        { $group: {
            _id: null,
            assets: { $sum: 1 },
            retainedBytes: { $sum: { $cond: [{ $and: [{ $eq: ["$retained", true] }, { $eq: ["$status", "attached"] }] }, "$size", 0] } },
            reservedBytes: { $sum: { $multiply: ["$size", { $add: [
                { $cond: [{ $ne: ["$status", "deleted"] }, 1, 0] },
                { $cond: [{ $eq: ["$stagingCleaned", true] }, 0, 1] }
            ] }] } }
        } },
        { $project: { _id: 0, assets: 1, retainedBytes: 1, reservedBytes: 1 } }
    ]);
    return usage || { assets: 0, retainedBytes: 0, reservedBytes: 0 };
}

export function imageStorageBudgets()
{
    const bytes = (name, fallback) =>
    {
        const value = Number(process.env[name] || fallback);
        if (!Number.isSafeInteger(value) || value < 10485760) throw new Error(`Invalid ${name}`);
        return value;
    };
    return {
        userBytes: bytes("IMAGE_USER_STORAGE_BYTES", 1024 ** 3),
        globalBytes: bytes("IMAGE_GLOBAL_STORAGE_BYTES", 8 * 1024 ** 3)
    };
}
