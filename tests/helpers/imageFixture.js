import { createImageAssetService } from "../../services/imageAssetService.js";

const valueAt = (record, key) => key.split(".").reduce((value, part) => value?.[part], record);
export function matches(record, filter)
{
    return Object.entries(filter).every(([key, expected]) =>
    {
        if (key === "$or") return expected.some(option => matches(record, option));
        const value = valueAt(record, key);
        if (expected === null) return value == null;
        if (expected && typeof expected === "object" && !(expected instanceof Date))
        {
            if ("$in" in expected) return expected.$in.includes(value);
            if ("$nin" in expected) return !expected.$nin.includes(value);
            if ("$ne" in expected) return value !== expected.$ne;
            if ("$lt" in expected) return value < expected.$lt;
            if ("$gt" in expected) return value > expected.$gt;
        }
        return String(value) === String(expected);
    });
}
const query = action =>
{
    let limit = Infinity;
    const execute = () =>
    {
        const result = action();
        return Array.isArray(result) ? result.slice(0, limit) : result;
    };
    const chain = { select: () => chain, limit: count => { limit = count; return chain; }, then: (resolve, reject) => Promise.resolve().then(execute).then(resolve, reject) };
    return chain;
};
export const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.from([0,0,0,13]), Buffer.from("IHDR"), Buffer.alloc(24)]);
export function imageFixture()
{
    const records = new Map();
    const blobs = new Map();
    const removed = [];
    const ContentModel = { exists: async ({ userId }) => userId === "owner" };
    const apply = (filter, changes) =>
    {
        const record = [...records.values()].find(value => matches(value, filter));
        if (!record) return null;
        Object.assign(record, changes.$set);
        return { ...record };
    };
    const Asset = {
        create: async input =>
        {
            const record = { status: "uploading", notionStatus: "not_requested", retained: false, contentId: null, stagingCleaned: false, operationAt: null, ...input, _id: String(input._id) };
            records.set(record._id, record);
            return { ...record };
        },
        findOne: filter => query(() => { const record = [...records.values()].find(value => matches(value, filter)); return record ? { ...record } : null; }),
        find: filter => query(() => [...records.values()].filter(record => matches(record, filter)).map(record => ({ ...record }))),
        countDocuments: async filter => [...records.values()].filter(record => matches(record, filter)).length,
        findOneAndUpdate: (filter, changes) => query(() => apply(filter, changes)),
        updateOne: async (filter, changes) => ({ modifiedCount: apply(filter, changes) ? 1 : 0 })
    };
    const objects = {
        authorize: async key => ({ uploadUrl: `https://r2.example.test/${key}`, headers: { "Content-Type": "image/png" } }),
        read: async key =>
        {
            if (!blobs.has(key)) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
            return { bytes: blobs.get(key), sha256: "test-hash" };
        },
        seal: async (key, bytes) => blobs.set(key, Buffer.from(bytes)),
        remove: async key => { removed.push(key); blobs.delete(key); },
        display: async key => `https://r2.example.test/signed/${encodeURIComponent(key)}`
    };
    const quotas = new Map();
    const Quota = {
        createIndexes: async () => {},
        findOneAndUpdate: async filter =>
        {
            const key = `${filter.userId}:${filter.day}`;
            const count = quotas.get(key) || 0;
            if (count >= filter.count.$lt) throw Object.assign(new Error("duplicate quota"), { code: 11000 });
            quotas.set(key, count + 1);
            return { count: count + 1 };
        }
    };
    const usage = async userId => [...records.values()].filter(record => !userId || record.userId === userId).reduce((total, record) =>
    {
        total.reservedBytes += record.size * (Number(record.status !== "deleted") + Number(!record.stagingCleaned));
        total.retainedBytes += record.retained && record.status === "attached" ? record.size : 0;
        total.assets += record.status !== "deleted" || !record.stagingCleaned ? 1 : 0;
        return total;
    }, { assets: 0, retainedBytes: 0, reservedBytes: 0 });
    const service = createImageAssetService({ Asset, ContentModel, objects, Quota, usage });
    const upload = async () =>
    {
        const result = await service.initiate("owner", { filename: "image.png", mimeType: "image/png", size: png.length });
        const record = records.get(result.uploadId);
        blobs.set(record.stagingKey, png);
        await service.complete("owner", result.uploadId);
        return record;
    };
    return { records, blobs, removed, Asset, objects, service, upload, Quota, quotas };
}
