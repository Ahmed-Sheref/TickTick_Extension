import Content from '../Models/Content.js';
import parseInput from '../utils/parse.js';
import analyzeContent from '../utils/generativeAI.js';
import normalizeTags from '../utils/normTags.js';
import Settings from '../Models/User.js';
import * as TickTickFunctions from '../utils/ticktick.js'
import mongoose from 'mongoose';

const getAllContents = async (req, res) =>
{
    try
    {
        const contents = await Content.find();
        res.status(200).json(
        {
            status: 'success',
            data: contents
        });
    }
    catch (error)
    {
        res.status(500).json(
        {
            status: 'error',
            message: error.message
        });
    }
}


/**
    {
        "title": "Backend Development Tips",
        "url": "https://medium.com/backend-tips",
        "rawText": "Testing our new system for TickTick extension...",
        "user_input": "~learning #node_js #mongodb"
    }
*/


const createContent = async (req, res) =>
{
    const session = await mongoose.startSession();

    try
    {
        session.startTransaction();

        let { userId, title, url, rawText, user_input, use_tagsAi, use_quiz, use_summaryAi, mergeWithUserText } = req.body;

        console.log("UserID -> ", userId);
        if (!userId || !title || !rawText)
        {
            return res.status(400).json(
            {
                status: "error",
                message: "userId, title and rawText are required"
            });
        }

        let { listName, tags } = parseInput(user_input || "");

        tags = normalizeTags(tags || []);
        listName = listName || "inbox";

        let summary = null;
        let ai_tags = [];
        let quiz = null;

        if (use_tagsAi || use_summaryAi || use_quiz)
        {
            try 
            {
                const aiData = await analyzeContent(rawText);

                if (use_summaryAi && aiData.summary)
                {
                    summary = aiData.summary;

                    if (mergeWithUserText)
                    {
                        rawText = `${rawText}\n\nSummary:\n${summary}`;
                    }
                }

                if (use_tagsAi && aiData.ai_tags)
                {
                    ai_tags = aiData.ai_tags;

                    tags = [...new Set([...tags, ...ai_tags])];
                    tags = normalizeTags(tags);
                }

                if (use_quiz && aiData.quiz)
                {
                    quiz = aiData.quiz;
                }
            }
            catch (aiError)
            {
                console.error('AI Analysis Error:', aiError.message);
                // Continue without AI features if they fail
                // setStatus('AI features unavailable, saving without AI enhancement', 'warning');
            }
        }

        const [content] = await Content.create(
            [{ userId, title, url, rawText, listName, tags, summary, quiz }],
            { session }
        );

        await session.commitTransaction();

        const user = await Settings.findOne({ userId });

        if (user?.tickTickConnected && user?.tickTickAccessToken)
        {
            try
            {
                const task = await TickTickFunctions.createTickTickTask(
                    user.tickTickAccessToken,
                    { title, rawText, tags }
                );

                await Content.findByIdAndUpdate(content._id,
                {
                    tickTickId: task.id
                });

                console.log("TickTick task created:", task.id);
            }
            catch (err)
            {
                console.error("TickTick sync failed:", err.message);
            }
        }

        return res.status(201).json(
        {
            status: "success",
            data:
            {
                content,
                summary,
                tags,
                quiz
            }
        });

    }
    catch (error)
    {
        await session.abortTransaction();

        return res.status(500).json(
        {
            status: "error",
            message: error.message
        });
    }
    finally
    {
        session.endSession();
    }
};

export { getAllContents, createContent };