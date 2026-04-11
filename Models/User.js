import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
{
    userId: 
    {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    email: 
    {
        type: String,
        trim: true,
        default: null
    },

    // Channels
    weeklyEmailEnabled: 
    {
        type: Boolean,
        default: false
    },

    telegramChatId: 
    {
        type: String,
        default: null
    },

    telegramConnected: 
    {
        type: Boolean,
        default: false
    },

    // Preferences
    receiveWeeklyEmail:
    {
        type: Boolean,
        default: true
    },

    receiveTelegramQuiz:
    {
        type: Boolean,
        default: true
    },

    useSummaryAi:
    {
        type: Boolean,
        default: true
    },

    useTagsAi: 
    {
        type: Boolean,
        default: true
    },

    useQuiz: 
    {
        type: Boolean,
        default: true
    },

    mergeSummary: 
    {
        type: Boolean,
        default: false
    },

    // TickTick
    tickTickTokenHash: 
    {
        type: String,
        unique: true,
        sparse: true
    },

    tickTickAccessToken: 
    {
        type: String,
        default: null
    },

    tickTickRefreshToken: 
    {
        type: String,
        default: null
    },

    tickTickConnected: 
    {
        type: Boolean,
        default: false
    }
},
{
    timestamps: true
});

const User = mongoose.model("User", userSchema);

export default User;