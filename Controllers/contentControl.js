import mongoose from "mongoose";
import Content from "../Models/Content.js";
import User from "../Models/User.js";
import parseInput from "../utils/parse.js";
import analyzeContent from "../utils/generativeAI.js";
import normalizeTags from "../utils/normTags.js";
import * as TickTickFunctions from "../utils/ticktick.js";
import { validate } from "node-cron";

const getAllContents = async (req, res) =>
{
    try
    {
        const contents = await Content.find();

        return res.status(200).json(
        {
            status: "success",
            data: contents
        });
    }
    catch (error)
    {
        return res.status(500).json(
        {
            status: "error",
            message: error.message
        });
    }
};

const validateQuizObject = (quiz) =>
{
    if (!quiz || typeof quiz !== 'object')
    {
        return null; // Quiz is optional
    }
    
    if (!quiz.question || typeof quiz.question !== 'string' || quiz.question.trim() === '')
    {
        return 'quiz.question is required and must be a non-empty string';
    }
    
    if (!Array.isArray(quiz.options) || quiz.options.length < 2)
    {
        return 'quiz.options must be an array with at least 2 options';
    }
    
    if (quiz.options.some(option => !option || typeof option !== 'string' || option.trim() === ''))
    {
        return 'all quiz.options must be non-empty strings';
    }
    
    if (!quiz.correctAnswer || typeof quiz.correctAnswer !== 'string' || quiz.correctAnswer.trim() === '')
    {
        return 'quiz.correctAnswer is required and must be a non-empty string';
    }
    
    if (!quiz.options.includes(quiz.correctAnswer))
    {
        return 'quiz.correctAnswer must exist in quiz.options';
    }
    
    return null;
};

const validateContentInput = ({ userId, title, rawText }) =>
{
    if (!userId || typeof userId !== 'string' || userId.trim() === '')
    {
        return 'userId is required and must be a non-empty string';
    }
    
    if (!title || typeof title !== 'string' || title.trim() === '')
    {
        return 'title is required and must be a non-empty string';
    }
    
    if (!rawText || typeof rawText !== 'string' || rawText.trim() === '')
    {
        return 'rawText is required and must be a non-empty string';
    }
    
    if (title.length > 500)
    {
        return 'title must be less than 500 characters';
    }
    
    if (rawText.length > 100000)
    {
        return 'rawText must be less than 100,000 characters';
    }
    
    return null;
};

const prepareContentIn = (userInput) =>
{
    const { listName, tags } = parseInput(userInput || "");

    return {
        listName: listName || "inbox",
        tags: normalizeTags(tags || [])
    };
};

const applyAi = async ({rawText, tags, useTagsAi, useSummaryAi, useQuiz, mergeSummaryWithContent}) =>
{
    let finalRawText = rawText;
    let finalTags = [...tags];
    let summary = null;
    let quiz = null;

    if (!useTagsAi && !useSummaryAi && !useQuiz)
    {
        return {
            finalRawText,
            finalTags,
            summary,
            quiz
        };
    }

    try
    {
        const aiData = await analyzeContent(rawText);

        if (useSummaryAi && aiData.summary)
        {
            summary = aiData.summary;

            if (mergeSummaryWithContent)
            {
                finalRawText = `${rawText}\n\nSummary:\n${summary}`;
            }
        }

        if (useTagsAi && aiData.ai_tags)
        {
            finalTags = normalizeTags([...finalTags, ...aiData.ai_tags]);
        }

        if (useQuiz && aiData.quiz)
        {
            quiz = aiData.quiz;
        }
    }
    catch (error)
    {
        console.error('[CONTENT] AI Analysis Error:', error.message);
    }

    return {
        finalRawText,
        finalTags,
        summary,
        quiz
    };
};

const saveContentToDb = async (
{
    session,
    userId,
    title,
    url,
    rawText,
    listName,
    tags,
    summary,
    quiz,
    options
}) =>
{
    const [content] = await Content.create(
        [
            {
                userId,
                title,
                url,
                rawText,
                listName,
                tags,
                summary,
                quiz,
                options
            }
        ],
        { session }
    );

    return content;
};

const syncContentToTickTick = async ({ userId, contentId, title, rawText, tags }) =>
{
    try
    {
        const user = await User.findOne({ userId });

        if (!user?.tickTickConnected || !user?.tickTickAccessToken)
        {
            return;
        }

        const task = await TickTickFunctions.createTickTickTask(
            user.tickTickAccessToken,
            { title, rawText, tags }
        );

        await Content.findByIdAndUpdate(
            contentId,
            {
                $set:
                {
                    "integrations.tickTickId": task.id
                }
            }
        );

        console.log('[CONTENT] TickTick task created:', task.id);
    }
    catch (error)
    {
        console.error('[CONTENT] TickTick sync failed:', error.message);
    }
};

const createContent = async (req, res) =>
{
    const session = await mongoose.startSession();

    try
    {
        let 
        {
            userId,
            title,
            url,
            rawText,
            user_input,
            use_tagsAi,
            use_quiz,
            use_summaryAi,
            mergeSummaryWithContent,
            includeInWeeklyEmail,
            includeInTelegramQuiz
        } = req.body;

        const validationError = validateContentInput({ userId, title, rawText });

        if (validationError)
        {
            return res.status(400).json(
            {
                status: "error",
                message: validationError
            });
        }

        const { listName, tags } = prepareContentIn(user_input);

        const  {finalRawText, finalTags, summary, quiz} = await applyAi(
        {
            rawText,
            tags,
            useTagsAi: use_tagsAi,
            useSummaryAi: use_summaryAi,
            useQuiz: use_quiz,
            mergeSummaryWithContent
        });

        // Validate quiz if it exists
        if (quiz) {
            const quizValidationError = validateQuizObject(quiz);
            if (quizValidationError) {
                return res.status(400).json({
                    status: "error",
                    message: quizValidationError
                });
            }
        }

        const options = 
        {
            useSummaryAi: Boolean(use_summaryAi),
            useTagsAi: Boolean(use_tagsAi),
            useQuiz: Boolean(use_quiz),
            mergeSummaryWithContent: Boolean(mergeSummaryWithContent),
            includeInWeeklyEmail: Boolean(includeInWeeklyEmail),
            includeInTelegramQuiz: Boolean(includeInTelegramQuiz)
        };

        session.startTransaction();

        const content = await saveContentToDb(
        {
            session,
            userId,
            title,
            url,
            rawText: finalRawText,
            listName,
            tags: finalTags,
            summary,
            quiz,
            options
        });

        await session.commitTransaction();

        await syncContentToTickTick(
        {
            userId,
            contentId: content._id,
            title,
            rawText: finalRawText,
            tags: finalTags
        });

        return res.status(201).json(
        {
            status: "success",
            data:
            {
                content,
                ai:
                {
                    summary,
                    tags: finalTags,
                    quiz
                }
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

const getContentByUserId = async (req, res) =>
{
    try
    {
        const { userId } = req.params;
        
        if (!userId || typeof userId !== 'string' || userId.trim() === '')
        {
            return res.status(400).json(
            {
                status: 'error',
                message: 'userId is required and must be a non-empty string'
            });
        }

        const contents = await Content.find({ userId })
            .sort({ createdAt: -1 })
            .select('-__v');

        return res.status(200).json(
        {
            status: 'success',
            data: contents,
            count: contents.length
        });
    }
    catch (error)
    {
        console.error('[CONTENT] Error fetching content by userId:', error.message);
        return res.status(500).json(
        {
            status: 'error',
            message: error.message
        });
    }
};

export { getAllContents, createContent, getContentByUserId };