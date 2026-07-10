import mongoose from "mongoose";
import Content from "../Models/Content.js";
import parseInput from "../utils/parse.js";
import analyzeContent from "../utils/generativeAI.js";
import normalizeTags from "../utils/normTags.js";
import postContentCreationService from "./postContentCreationService.js";

import {validateContentInput,validateQuizObject} from "../validators/contentValidator.js";
import { getTickTickProjects } from "../utils/ticktick.js";
import User from "../Models/User.js";


const prepareContentInput = (userInput) =>
{
    const { listName, tags } = parseInput(userInput || "");

    return {
        listName: listName || "inbox",
        tags: normalizeTags(tags || [])
    };
};

const applyAiToContent = async (
{
    rawText,
    tags,
    useTagsAi,
    useSummaryAi,
    useQuiz,
    mergeSummaryWithContent
}) =>
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
        console.error("[CONTENT] AI Analysis Error:", error.message);
    }

    return {
        finalRawText,
        finalTags,
        summary,
        quiz
    };
};

const buildContentOptions = (
{
    useSummaryAi,
    useTagsAi,
    useQuiz,
    mergeSummaryWithContent
}) =>
{
    return {
        useSummaryAi: Boolean(useSummaryAi),
        useTagsAi: Boolean(useTagsAi),
        useQuiz: Boolean(useQuiz),
        mergeSummaryWithContent: Boolean(mergeSummaryWithContent),
        includeInWeeklyEmail: Boolean(useSummaryAi),
        includeInTelegramQuiz: Boolean(useQuiz)
    };
};

const createContentDocument = async ({
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


const createContent = async (payload) =>
{
    const session = await mongoose.startSession();

    try
    {
        const {
            userId,
            title,
            url,
            rawText,
            user_input,
            use_tagsAi,
            use_quiz,
            use_summaryAi,
            mergeSummaryWithContent,
            projectId
        } = payload;


        const user = await User.findOne({userId}).select("tickTickAccessToken tickTickConnected");

        if (!user)
        {
            const error = new Error(
                "User not found"
            );

            error.statusCode = 404;
            throw error;
        }

        if (!user.tickTickConnected ||!user.tickTickAccessToken)
        {
            const error = new Error("TickTick account is not connected");
            error.statusCode = 401;
            throw error;
        }


        console.time("project-validation");
        const projectIds = await getTickTickProjects(user.tickTickAccessToken);
        console.timeEnd("project-validation");
        const projectExists = projectIds.some((project) =>
        {
            return String(project.id) === String(projectId);
        });

        if (!projectExists)
        {
            const error = new Error("Selected TickTick project no longer exists");

            error.statusCode = 400;
            throw error;
        }


        const validationError = validateContentInput({
            userId,
            title,
            rawText
        });

        if (validationError)
        {
            const error = new Error(validationError);
            error.statusCode = 400;
            throw error;
        }

        const { listName, tags } = prepareContentInput(user_input);

        const 
        {
            finalRawText,
            finalTags,
            summary,
            quiz
        } = await applyAiToContent(
        {
            rawText,
            tags,
            useTagsAi: use_tagsAi,
            useSummaryAi: use_summaryAi,
            useQuiz: use_quiz,
            mergeSummaryWithContent
        });

        if (quiz)
        {
            const quizValidationError = validateQuizObject(quiz);

            if (quizValidationError)
            {
                const error = new Error(quizValidationError);
                error.statusCode = 400;
                throw error;
            }
        }

        const options = buildContentOptions(
        {
            useSummaryAi: use_summaryAi,
            useTagsAi: use_tagsAi,
            useQuiz: use_quiz,
            mergeSummaryWithContent
        });

        session.startTransaction();

        const content = await createContentDocument(
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

        await postContentCreationService.runPostCreationTasks(
        {
            userId,
            content,
            title,
            rawText: finalRawText,
            tags: finalTags,
            projectId
        });

        return {
            content,
            ai:
            {
                summary,
                tags: finalTags,
                quiz
            }
        };
    }
    catch (error)
    {
        await session.abortTransaction();
        throw error;
    }
    finally
    {
        await session.endSession();
    }
};



export default {
    createContent
};