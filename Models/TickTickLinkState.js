import mongoose from "mongoose";

// Separate collection/purpose from the legacy login state. No credentials.
const tickTickLinkStateSchema = new mongoose.Schema(
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

tickTickLinkStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.TickTickLinkState || mongoose.model("TickTickLinkState", tickTickLinkStateSchema);
