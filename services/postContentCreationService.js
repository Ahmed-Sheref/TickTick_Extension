import User from "../Models/User.js";
import Content from "../Models/Content.js";
import * as TickTickFunctions from "../utils/ticktick.js";

const syncContentToTickTick = async (
{
    userId,
    contentId,
    title,
    rawText,
    tags,
    projectId
}) =>
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
            {
                title,
                rawText,
                tags,
                projectId
            }
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

        console.log("[CONTENT] TickTick task created:", task.id);
    }
    catch (error)
    {
        console.error("[CONTENT] TickTick sync failed:", error.message);
    }
};

const runPostCreationTasks = async ({userId,content,title,rawText,tags, projectId}) =>
{
    await syncContentToTickTick(
    {
        userId,
        contentId: content._id,
        title,
        rawText,
        tags,
        projectId
    });
};

export default {
    runPostCreationTasks
};