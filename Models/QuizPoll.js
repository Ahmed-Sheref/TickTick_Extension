import mongoose from "mongoose";

const quizPollSchema = new mongoose.Schema({
    pollId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    contentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Content",
        required: true
    },
    userId: {
        type: String,
        required: true,
        trim: true
    },
    chatId: {
        type: String,
        required: true,
        trim: true
    },
    isAnswered: {
        type: Boolean,
        default: false
    },
    sentAt: {
        type: Date,
        default: Date.now
    },
    answeredAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Indexes for performance
quizPollSchema.index({ pollId: 1 });
quizPollSchema.index({ contentId: 1 });
quizPollSchema.index({ userId: 1, isAnswered: 1 });
quizPollSchema.index({ chatId: 1 });

const QuizPoll = mongoose.model("QuizPoll", quizPollSchema);

export default QuizPoll;
