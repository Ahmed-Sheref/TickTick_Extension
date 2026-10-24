import mongoose from "mongoose";

const notionLinkStateSchema = new mongoose.Schema(
{
    stateHash: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    extensionRedirectUri: { type: String, required: true },
    clientNonce: { type: String, required: true },
    providerRedirectUri: { type: String, required: true },
    expiresAt: { type: Date, required: true }
},
{
    timestamps: true
});

notionLinkStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.NotionLinkState || mongoose.model("NotionLinkState", notionLinkStateSchema);
