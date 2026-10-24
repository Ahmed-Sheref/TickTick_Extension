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

    // Exact credential identity only; not a verified external account ID.
    credentialFingerprint:
    {
        type: String,
        default: null,
        select: false,
        validate:
        {
            validator: (value) =>
            {
                return value === null || value === undefined || /^[a-f0-9]{64}$/.test(value);
            },
            message: "Invalid credentialFingerprint"
        }
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

    // Notion-only distributed refresh claim. No automatic lease expiry: an
    // uncertain rotated credential must be recovered through reauthorization.
    notionRefreshLock:
    {
        type: String,
        default: null,
        select: false
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

connectedAccountSchema.index(
    {
        provider: 1,
        credentialFingerprint: 1
    },
    {
        name: "ticktick_credential_fingerprint_unique",
        unique: true,
        partialFilterExpression:
        {
            provider: "ticktick",
            credentialFingerprint: { $type: "string" }
        }
    }
);

const ConnectedAccount = mongoose.models.ConnectedAccount
    || mongoose.model("ConnectedAccount", connectedAccountSchema);

export { PROVIDERS };
export default ConnectedAccount;
