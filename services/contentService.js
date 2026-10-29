import imageAssets, { imageIntent } from "./imageAssetService.js";
import { contentSyncStatus } from "./contentSyncStatusService.js";
import { buildInitialIntegrationStates } from "./contentIntegrationState.js";
import
{
    contentDestinations,
    invalidDestination
}
from "../validators/contentDestinations.js";
import notionCredentials from "./notionCredentials.js";
import
{
    selectedNotionDestination
}
from "./notionDestinationService.js";
import mongoose from "mongoose";
import Content from "../Models/Content.js";
import parseInput from "../utils/parse.js";
import analyzeContent from "../utils/generativeAI.js";
import normalizeTags from "../utils/normTags.js";
import postContentCreationService from "./postContentCreationService.js";

import
{
    validateContentInput,
    validateQuizObject
}
from "../validators/contentValidator.js";
import User from "../Models/User.js";
import
{
    getTickTickAccessToken
}
from "./ticktickCredentials.js";

const prepareContentInput = (userInput) =>
{
    const
    {
        listName,
        tags
    } = parseInput(userInput || "");

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
    useQuiz
}) =>
{
    let finalTags = [...tags];
    let summary = null;
    let quiz = null;

    if (!useTagsAi && !useSummaryAi && !useQuiz)
    {
        return {
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
        finalTags,
        summary,
        quiz
    };
};

// Historical delivery eligibility is contractual: active weekly services consume
// these flags. Explicit destinations suppress only primary summary/tag AI.
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

const createContentDocument = async (
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
    options,
    destinations,
    integrations
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
            options,
            destinations,
            integrations
        }],
        {
            session
        }
    );

    return content;
};

// Legacy fields are selected solely for ticktickCredentials fallback; new linked
// credentials remain owned by that module. Keep existence lookup before intent validation.
const requireContentOwner = async userId =>
{
    const user = await User.findOne(
    {
        userId
    }).select("tickTickAccessToken tickTickConnected");

    if (!user)
    {
        const error = new Error("User not found");

        error.statusCode = 404;
        throw error;
    }

    return user;
};

// Preserve pre-commit prerequisite policy and provider ordering. Verification here
// binds saved intent; external content writes remain exclusively in the workers.
const verifySelectedDestinations = async (userId, user, destinations) =>
{
    if (destinations.notion.enabled)
    {
        const
        {
            connection
        } = await notionCredentials.getForUser(
        {
            userId
        });
        const selection = selectedNotionDestination(connection);
        if (destinations.notion.id &&
            (destinations.notion.id !== selection.id || destinations.notion.type !== selection.type))
        {
            throw invalidDestination("Notion default changed. Confirm the current destination before saving");
        }
        Object.assign(destinations.notion, selection,
        {
            connectionId: connection.accountId,
            connectionIdentity: connection.providerAccountId,
            workspaceId: connection.workspaceId
        });
    }
    if (destinations.ticktick.enabled)
    {
        // Token lookup keeps its existing linked-account and legacy fallback policy.
        const accessToken = await getTickTickAccessToken(userId, user);
        if (!accessToken)
        {
            const error = new Error("TickTick account is not connected");
            error.statusCode = 401;
            throw error;
        }
    }
};

const createContent = async (payload) =>
{
    const session = await mongoose.startSession();

    try
    {
        const
        {
            userId,
            title,
            url,
            rawText,
            user_input,
            use_tagsAi,
            use_quiz,
            use_summaryAi,
            mergeSummaryWithContent
        } = payload;

        const validationError = validateContentInput(
        {
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

        const user = await requireContentOwner(userId);

        const destinations = contentDestinations(payload);
        await verifySelectedDestinations(userId, user, destinations);

        const
        {
            listName,
            tags
        } = prepareContentInput(user_input);

        const
        {
            finalTags,
            summary,
            quiz
        } = await applyAiToContent(
        {
            rawText,
            tags,
            useTagsAi: payload.destinations ? false : use_tagsAi,
            useSummaryAi: payload.destinations ? false : use_summaryAi,
            useQuiz: use_quiz
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
            useSummaryAi: payload.destinations ? false : use_summaryAi,
            useTagsAi: payload.destinations ? false : use_tagsAi,
            useQuiz: use_quiz,
            mergeSummaryWithContent
        });

        const images = imageIntent(payload);
        session.startTransaction();

        const content = await createContentDocument(
        {
            session,
            userId,
            title,
            url,
            rawText,
            listName,
            tags: finalTags,
            summary,
            quiz,
            options,
            destinations,
            integrations: buildInitialIntegrationStates(destinations)
        });

        if (images)
        {
            content.imageRetention = images.retain;
            content.imageNotionIncluded = images.notion;
            content.images = await imageAssets.attach({ userId, contentId: content._id, intent: images,
                notion: images.notion, session });
            await content.save({ session });
        }
        await session.commitTransaction();

        postContentCreationService.runPostCreationTasks({ content });

        return {
            content,
            syncStatus: contentSyncStatus(content),
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
        if (session.inTransaction())
        {
            await session.abortTransaction();
        }

        console.error(
            "[CONTENT] Create error:",
            error.statusCode || 500
        );

        throw error;
    }
    finally
    {
        try
        {
            await session.endSession();
        }
        catch
        {
            console.error("[CONTENT] Session cleanup needs attention");
        }
    }
};

export default
{
    createContent
};
