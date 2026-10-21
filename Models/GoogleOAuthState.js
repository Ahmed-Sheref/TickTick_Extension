
import mongoose from "mongoose";

const googleOAuthStateSchema = new mongoose.Schema(
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

    extensionCodeChallenge:
    {
        type: String,
        required: true
    },

    googleNonce:
    {
        type: String,
        required: true
    },

    googleCodeVerifier:
    {
        type: String,
        required: true,
        select: false
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

googleOAuthStateSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
);

const GoogleOAuthState = mongoose.models.GoogleOAuthState
    || mongoose.model("GoogleOAuthState", googleOAuthStateSchema);

export default GoogleOAuthState;
