import mongoose from 'mongoose';

const oauthExchangeSchema = new mongoose.Schema(
{
    codeHash:
    {
        type: String,
        required: true,
        unique: true
    },

    codeChallenge:
    {
        type: String,
        required: true
    },

    userId:
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

oauthExchangeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.OAuthExchange || mongoose.model('OAuthExchange', oauthExchangeSchema);
