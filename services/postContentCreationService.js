import ticktickContentService from "./ticktickContentService.js";
import notionContentService from "./notionContentService.js";
import { notionErrors } from "../utils/notionErrors.js";

const reportTickTickFailure = () =>
{
    console.error("[CONTENT] TickTick synchronization needs attention");
};

const reportNotionFailure = error =>
{
    const code = Object.hasOwn(notionErrors, error?.code || "")
        ? error.code
        : "NOTION_SYNC_FAILED";
    console.error("[CONTENT] Notion sync failed:", code);
};

// Best-effort dispatch after commit. Saved intent is not a durable queue.
export const createPostContentCreationService = (
{
    syncTickTick = input => ticktickContentService.syncContent(input),
    syncNotion = input => notionContentService.syncIfSelected(input)
} = {}) =>
{
    const runPostCreationTasks = ({ content }) =>
    {
        const input =
        {
            userId: content.userId,
            contentId: content._id
        };

        if (content.destinations?.ticktick?.enabled)
        {
            void Promise.resolve()
                .then(() => syncTickTick(input))
                .catch(reportTickTickFailure);
        }

        if (content.destinations?.notion?.enabled)
        {
            void Promise.resolve()
                .then(() => syncNotion(input))
                .catch(reportNotionFailure);
        }
    };

    return { runPostCreationTasks };
};

export default createPostContentCreationService();
