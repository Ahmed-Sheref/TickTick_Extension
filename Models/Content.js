import mongoose from "mongoose";

const quizSchema = new mongoose.Schema(
    {
        question: { type: String, trim: true },
        options: [{ type: String, trim: true }],
        correctAnswer: { type: String, trim: true },
        isSolved: { type: Boolean, default: false }
    },
    { _id: false }
);

const articleOptionsSchema = new mongoose.Schema(
    {
        useSummaryAi: { type: Boolean, default: true },
        useTagsAi: { type: Boolean, default: true },
        useQuiz: { type: Boolean, default: true },
        includeInWeeklyEmail: { type: Boolean, default: true },
        includeInTelegramQuiz: { type: Boolean, default: true },
        mergeSummaryWithContent: { type: Boolean, default: false }
    },
    { _id: false }
);

const integrationSchema = new mongoose.Schema(
    {
        tickTickId: { type: String, default: null },
        tickTickProjectId: { type: String, default: null }
    },
    { _id: false }
);

const contentSchema = new mongoose.Schema(
{
    userId: 
    {
        type: String,
        required: true,
        index: true,
        trim: true
    },

    title: 
    {
        type: String,
        required: true,
        trim: true
    },

    url: 
    {
        type: String,
        trim: true,
        default: null
    },

    rawText: 
    {
        type: String,
        required: true,
        trim: true
    },

    listName: 
    {
        type: String,
        default: "inbox",
        trim: true,
        lowercase: true
    },

    tags: [
    {
        type: String,
        trim: true,
        lowercase: true
    }
    ],

    summary: 
    {
        type: String,
        default: null,
        trim: true
    },

    quiz: 
    {
        type: quizSchema,
        default: null
    },

    options: 
    {
        type: articleOptionsSchema,
        default: () => ({})
    },

    integrations: 
    {
        type: integrationSchema,
        default: () => ({})
    },

    isRead: 
    {
        type: Boolean,
        default: false
    },

    lastEmailedAt: 
    {
        type: Date,
        default: null
    }
},
{
    timestamps: true
}
);

contentSchema.index({ userId: 1, createdAt: -1 });
contentSchema.index({ userId: 1, listName: 1 });
contentSchema.index({ userId: 1, tags: 1 });
contentSchema.index({ userId: 1, title: "text", rawText: "text" });

const Content = mongoose.model("Content", contentSchema);

export default Content;