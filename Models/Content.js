import mongoose from "mongoose";

const quizSchema = new mongoose.Schema(
{
    question:
    {
        type: String,
        trim: true
    },
    options: [
    {
        type: String,
        trim: true
    }],
    correctAnswer:
    {
        type: String,
        trim: true
    },
    isSolved:
    {
        type: Boolean,
        default: false
    }
},
{
    _id: false
});

const articleOptionsSchema = new mongoose.Schema(
{
    useSummaryAi:
    {
        type: Boolean,
        default: false
    },
    useTagsAi:
    {
        type: Boolean,
        default: false
    },
    useQuiz:
    {
        type: Boolean,
        default: false
    },
    includeInWeeklyEmail:
    {
        type: Boolean,
        default: false
    },
    includeInTelegramQuiz:
    {
        type: Boolean,
        default: false
    },
    mergeSummaryWithContent:
    {
        type: Boolean,
        default: false
    }
},
{
    _id: false
});

const notionSyncSchema = new mongoose.Schema(
{
    status:
    {
        type: String,
        enum: ["pending", "synced", "failed", "partial", "uncertain"],
        required: true
    },
    // An interrupted write is never reclaimed automatically. A late provider
    // response could otherwise create duplicates after a lease expires.
    claim:
    {
        type: String,
        default: null,
        select: false
    },
    phase:
    {
        type: String,
        enum: ["preparing", "creating", "appending", "complete"],
        default: "preparing"
    },
    pageId:
    {
        type: String,
        default: null
    },
    pageUrl:
    {
        type: String,
        default: null
    },
    destinationId:
    {
        type: String,
        default: null
    },
    destinationType:
    {
        type: String,
        enum: ["page", "data_source"],
        default: "page"
    },
    connectionId:
    {
        type: String,
        default: null
    },
    connectionIdentity:
    {
        type: String,
        default: null
    },
    workspaceId:
    {
        type: String,
        default: null
    },
    contentHash:
    {
        type: String,
        default: null
    },
    blocksWritten:
    {
        type: Number,
        min: 0,
        max: 1000,
        default: 0
    },
    totalBlocks:
    {
        type: Number,
        min: 0,
        max: 1000,
        default: 0
    },
    lastAttemptAt:
    {
        type: Date,
        default: null
    },
    errorCode:
    {
        type: String,
        maxlength: 80,
        default: null
    }
},
{
    _id: false
});

const integrationSchema = new mongoose.Schema(
{
    tickTickId:
    {
        type: String,
        default: null
    },
    tickTickProjectId:
    {
        type: String,
        default: null
    },
    ticktick:
    {
        type: new mongoose.Schema(
        {
            status:
            {
                type: String,
                enum: ["queued", "pending", "synced", "failed", "uncertain"],
                required: true
            },
            claim:
            {
                type: String,
                default: null,
                select: false
            },
            phase:
            {
                type: String,
                enum: ["preparing", "creating", "complete"],
                default: "preparing"
            },
            taskId:
            {
                type: String,
                default: null
            },
            projectId:
            {
                type: String,
                default: null
            },
            errorCode:
            {
                type: String,
                default: null
            },
            summary:
            {
                type: String,
                default: null
            },
            tags: [String],
            aiStatus:
            {
                type: String,
                enum: ["not_requested", "pending", "generated", "failed"],
                default: "not_requested"
            },
            lastAttemptAt: Date
        },
        {
            _id: false
        }),
        default: undefined
    },
    notion:
    {
        type: notionSyncSchema,
        default: undefined
    }
},
{
    _id: false
});

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
    }],

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
        default: () => (
        {})
    },

    // Missing on legacy records. Safe server-normalized intent, never credentials.
    destinations:
    {
        type: new mongoose.Schema(
        {
            ticktick:
            {
                enabled: Boolean,
                projectId: String,
                options:
                {
                    useAiSummary: Boolean,
                    useAiTags: Boolean,
                    mergeSummaryWithContent: Boolean,
                    tags: [String]
                }
            },
            notion:
            {
                type: new mongoose.Schema(
                {
                    enabled: Boolean,
                    id: String,
                    type: String,
                    selectionId: String,
                    connectionId: String,
                    connectionIdentity: String,
                    workspaceId: String
                },
                {
                    _id: false
                })
            }
        },
        {
            _id: false
        }),
        default: undefined
    },

    integrations:
    {
        type: integrationSchema,
        default: () => (
        {})
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
});

contentSchema.index(
{
    userId: 1,
    createdAt: -1
});
contentSchema.index(
{
    userId: 1,
    listName: 1
});
contentSchema.index(
{
    userId: 1,
    tags: 1
});
contentSchema.index(
{
    userId: 1,
    title: "text",
    rawText: "text"
});

const Content = mongoose.model("Content", contentSchema);

export default Content;
