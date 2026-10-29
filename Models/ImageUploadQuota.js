import mongoose from "mongoose";

// Only quota counters expire through TTL. Image records never use TTL because
// deleting Mongo metadata cannot remove objects from R2.
const schema = new mongoose.Schema(
{
    userId: { type: String, required: true },
    day: { type: String, required: true },
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true }
});
schema.index({ userId: 1, day: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("ImageUploadQuota", schema);
