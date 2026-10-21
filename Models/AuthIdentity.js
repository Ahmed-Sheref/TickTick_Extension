import mongoose from "mongoose";

const AUTH_PROVIDERS = ["google"];

const authIdentitySchema = new mongoose.Schema(
{
    // Application User.userId. Never derived from a provider access token.
    userId:
    {
        type: String,
        required: true,
        trim: true
    },

    provider:
    {
        type: String,
        required: true,
        enum: AUTH_PROVIDERS,
        lowercase: true,
        trim: true
    },

    // Stable provider subject only (Google sub). Never an access token or email.
    providerSubject:
    {
        type: String,
        required: true,
        trim: true
    }
},
{
    timestamps: true
});

authIdentitySchema.index(
    {
        provider: 1,
        providerSubject: 1
    },
    {
        unique: true
    }
);

authIdentitySchema.index(
    {
        userId: 1,
        provider: 1
    },
    {
        unique: true
    }
);

const AuthIdentity = mongoose.models.AuthIdentity
    || mongoose.model("AuthIdentity", authIdentitySchema);

export { AUTH_PROVIDERS };
export default AuthIdentity;
