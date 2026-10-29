import mongoose from "mongoose";

const imageAssetSchema = new mongoose.Schema(
{
    userId: { type: String, required: true, index: true },
    contentId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    stagingKey: { type: String, required: true, select: false },
    storageKey: { type: String, required: true, select: false },
    filename: { type: String, required: true, maxlength: 180 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, select: false },
    status: { type: String, enum: ["uploading", "verifying", "uploaded", "attached", "deleting", "deleted"], default: "uploading" },
    retained: { type: Boolean, default: false },
    uploadExpiresAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    // Explicit staging cleanup survives reuse of a still-valid presigned PUT URL.
    stagingCleaned: { type: Boolean, default: false },
    notionStatus: { type: String, enum: ["not_requested", "pending", "uploading", "uploaded", "inserting", "synced", "failed", "uncertain"], default: "not_requested" },
    notionUploadId: String,
    notionUploadExpiresAt: Date,
    notionBlockId: String,
    operationAt: Date,
    errorCode: String
}, { timestamps: true });
imageAssetSchema.index({ retained: 1, status: 1, expiresAt: 1 });
imageAssetSchema.index({ stagingCleaned: 1, uploadExpiresAt: 1 });
imageAssetSchema.index({ userId: 1, createdAt: -1 });
export default mongoose.model("ImageAsset", imageAssetSchema);
