import mongoose from 'mongoose';

const oauthStateSchema = new mongoose.Schema(
{
    stateHash:
    {
        type: String,
        required: true,
        unique: true
    },

    extensionRedirectUri:
    {
        type: String,
        required: true
    },

    clientNonce:
    {
        type: String,
        required: true
    },

    codeChallenge:
    {
        type: String,
        required: true
    },

    expiresAt:
    {
        type: Date,
        required: true
    }
},
{
    timestamps: true
});

oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.OAuthState || mongoose.model('OAuthState', oauthStateSchema);
