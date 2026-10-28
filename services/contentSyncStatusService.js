import Content from "../Models/Content.js";
import
{
    safeNotionUrl
}
from "./notionDestinationService.js";
import
{
    notionId
}
from "../validators/notionValidator.js";

const failure = (message, statusCode) => Object.assign(new Error(message),
{
    statusCode
});
const safeId = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null;
export const contentSyncStatus = content =>
{
    const integrations = content.integrations ||
    {};
    const tick = integrations.ticktick;
    const notion = integrations.notion;
    // New captures obey explicit saved intent. Historical records without it
    // retain legacy inference; a missing Notion attempt projects queued without
    // adding queued to the persisted Notion state machine.
    const hasIntent = Boolean(content.destinations);
    const tickRequested = hasIntent ? content.destinations.ticktick?.enabled === true : Boolean(tick || integrations.tickTickId);
    const notionRequested = hasIntent ? content.destinations.notion?.enabled === true : Boolean(notion);
    const provider = (requested, state, legacyId) =>
    {
        const supported = ["queued", "pending", "synced", "failed", "partial", "uncertain"];
        const status = !requested ? "not_requested" : supported.includes(state?.status) ? state.status : legacyId ? "synced" : "queued";
        return {
            requested,
            status,
            errorCode: typeof state?.errorCode === "string" && /^(NOTION|TICKTICK)_[A-Z_]{1,70}$/.test(state.errorCode) ? state.errorCode : null,
            retryable: requested && !state?.claim && state?.errorCode !== "NOTION_SYNC_CONFLICT" && ["queued", "failed", "partial"].includes(status)
        };
    };
    const ticktick = provider(tickRequested, tick, integrations.tickTickId);
    const notionResult = provider(notionRequested, notion);
    ticktick.taskId = ticktick.status === "synced" ? safeId(tick?.taskId || integrations.tickTickId) : null;
    ticktick.aiStatus = ["not_requested", "pending", "generated", "failed"].includes(tick?.aiStatus) ? tick.aiStatus : "not_requested";
    notionResult.pageId = notionResult.status === "synced" ? notionId(notion?.pageId) : null;
    notionResult.pageUrl = notionResult.status === "synced" && notionResult.pageId ? safeNotionUrl(notion?.pageUrl) : null;
    // Corrupt/legacy acknowledgements must never be promoted to a confirmed copy.
    if (ticktick.status === "synced" && !ticktick.taskId)
    {
        ticktick.status = "uncertain";
        ticktick.retryable = false;
    }
    if (notionResult.status === "synced" && (!notionResult.pageId || !notionResult.pageUrl))
    {
        notionResult.status = "uncertain";
        notionResult.retryable = false;
    }
    return {
        contentId: String(content._id),
        ticktick,
        notion: notionResult
    };
};

export const createContentSyncStatusService = (
{
    ContentModel = Content
} = {}) => (
{
    getStatus: async (
    {
        userId,
        contentId
    }) =>
    {
        if (typeof contentId !== "string" || !/^[a-f0-9]{24}$/i.test(contentId)) throw failure("Invalid content ID", 400);
        const content = await ContentModel.findOne(
            {
                _id: contentId,
                userId
            })
            .select("_id userId destinations integrations +integrations.ticktick.claim +integrations.notion.claim");
        if (!content || content.userId !== userId) throw failure("Content was not found for this account", 404);
        return contentSyncStatus(content);
    }
});
export default createContentSyncStatusService();
