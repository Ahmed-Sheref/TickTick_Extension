import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
{
    userId:
    {
        type: String,
        required: true,
        unique: true
    },

    email:
    {
        type: String
    },

    weeklyEmail:
    {
        type: Boolean,
        default: false
    },

    telegramChatId:
    {
        type: String
    },
    tickTickTokenHash:
    {
        type: String,
        unique: true,
        sparse: true
    },
    telegramQuiz:
    {
        type: Boolean,
        default: false
    },
    tickTickAccessToken: { type: String },
    tickTickRefreshToken: { type: String },
    tickTickConnected: { type: Boolean, default: false }

},
{
    timestamps: true
});

const Settings = mongoose.model("User", settingsSchema);

export default Settings;