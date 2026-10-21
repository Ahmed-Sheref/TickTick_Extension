import mongoose from "mongoose";

const PROVIDERS = ["ticktick", "notion"];

const connectedAccountSchema = new mongoose.Schema(
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
        enum: PROVIDERS,
        lowercase: true,
        trim: true
    },

    connected:
    {
        type: Boolean,
        default: false
    },

    // Stable provider identity only (workspace/bot/user id). Never an access token.
    providerAccountId:
    {
        type: String,
        default: null,
        trim: true
    },

    encryptedAccessToken:
    {
        type: String,
        default: null,
        select: false
    },

    encryptedRefreshToken:
    {
        type: String,
        default: null,
        select: false
    },

    tokenKeyId:
    {
        type: String,
        default: null,
        trim: true
    },

    tokenEncryptedAt:
    {
        type: Date,
        default: null
    },

    metadata:
    {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({})
    }
},
{
    timestamps: true
});

connectedAccountSchema.index(
    {
        userId: 1,
        provider: 1
    },
    {
        unique: true
    }
);

connectedAccountSchema.index(
    {
        provider: 1,
        providerAccountId: 1
    },
    {
        unique: true,
        partialFilterExpression:
        {
            providerAccountId:
            {
                $type: "string"
            }
        }
    }
);

const ConnectedAccount = mongoose.models.ConnectedAccount
    || mongoose.model("ConnectedAccount", connectedAccountSchema);

export { PROVIDERS };
export default ConnectedAccount;
