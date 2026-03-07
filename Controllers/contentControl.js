import Content from '../Models/Content.js';
import parseInput from '../utils/parse.js';
import analyzeContent from '../utils/generativeAi.js';
import normalizeTags from '../utils/normTags.js';
import Settings from '../Models/User.js';
import * as TickTickFunctions from '../utils/ticktick.js'
import mongoose from 'mongoose';

const getAllContents = async (req, res) =>
{
    try
    {
        const contents = await Content.find();
        res.status(200).json({
            status: 'success',
            data: contents
        });
    }
    catch (error)
    {
        res.status(500).json({
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
    session.startTransaction();
    try
    {
        let { userId, title, url, rawText, user_input, use_tagsAi, use_quiz, use_summaryAi, mergeWithUserText} = req.body;
        let { listName, tags } = parseInput(user_input);
        if (!title || !url || !rawText || !user_input)
        {
            return res.status(400).json(
            {
                status: 'error',
                message: 'All fields are required'
            });
        }
        if (!listName || !tags)
        {
            tags = [];
            listName = 'inbox';
        }
        let summary = null;
        let ai_tags = [];
        let quiz = null;

        if (use_tagsAi || use_summaryAi || use_quiz)
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

                // Merge AI tags with user tags
                tags = [...new Set([...tags, ...ai_tags])];
                tags = normalizeTags(tags);
            }

            if (use_quiz && aiData.quiz)
            {
                quiz = aiData.quiz;
            }
        }

        // Create Content
        const [content] = await Content.create(
            [{ userId, title, url, rawText, listName, tags, summary, quiz }],
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        let user;
        try 
        {
            user = await Settings.findOne({ userId });
        } 
        catch (dbError) 
        {
            console.error('Database error finding user:', dbError.message);
        }

        if (user?.tickTickConnected && user?.tickTickAccessToken)
        {
            try
            {
                console.log('Creating TickTick task for:', title);
                const task = await TickTickFunctions.createTickTickTask(
                    user.tickTickAccessToken,
                    { title, rawText, tags }
                );
                console.log('TickTick task created successfully:', task.id);

                await Content.findByIdAndUpdate(content._id, { tickTickId: task.id });
            }
            catch (tickErr)
            {
                console.error('TickTick Error:', tickErr.message);
                console.error('Full error:', tickErr);
            }
        }
        else
        {
            
            console.log('TickTick not connected or missing access token');
            console.log('User exists:', !!user);
            console.log('tickTickConnected:', user?.tickTickConnected);
            console.log('tickTickAccessToken exists:', !!user?.tickTickAccessToken);
            throw new Error("User Not Found");
        }

        return res.status(201).json(
        {
            status: 'success',
            data:
            {
                content,
                summary,
                rawText,
                tags,
                quiz
            }
        });

    }
    catch (error)
    {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json(
        {
            status: 'error',
            message: error.message
        });
    }
}

export { getAllContents, createContent };