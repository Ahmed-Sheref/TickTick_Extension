import mongoose from "mongoose";

const contentSchema = new mongoose.Schema(
{
    userId:
    {
        type: String,
        required: true,
    },

    title:
    {
        type: String,
        required: true,
        trim: true
    },

    url:
    {
        type: String
    },

    rawText:
    {
        type: String,
        required: true
    },

    listName:
    {
        type: String,
        default: "inbox"
    },

    tags:
    [
        {
            type: String
        }
    ],

    tickTickId: { type: String },
    tickTickProjectId:
    {
        type: String
    },
    
    summary:
    {
        type: String
    },

    quiz:
    {
        question: String,
        options: [String],
        correctAnswer: String,
        isSolved:
        {
            type: Boolean,
            default: false
        }
    },

    isRead:
    {
        type: Boolean,
        default: false
    }

},
{
    timestamps: true
});

contentSchema.index({ userId: 1 });

const Content = mongoose.model("Content", contentSchema);

export default Content;