import
{
    randomUUID
}
from "node:crypto";
import Content from "../Models/Content.js";
import
{
    getTickTickAccessToken
}
from "./ticktickCredentials.js";
import
{
    createTickTickTask,
    getTickTickProjects
}
from "../utils/ticktick.js";
import normalizeTags from "../utils/normTags.js";

export const ticktickFailure = (code, statusCode = 409) => Object.assign(new Error(
{
    TICKTICK_NOT_REQUESTED: "TickTick was not requested for this capture",
    TICKTICK_NOT_CONNECTED: "Connect TickTick before retrying",
    TICKTICK_PROJECT_UNAVAILABLE: "The selected TickTick list is unavailable. Review it in TickTick before retrying",
    TICKTICK_SYNC_IN_PROGRESS: "TickTick synchronization is already claimed; interrupted attempts need review",
    TICKTICK_SYNC_UNCERTAIN: "A TickTick write may have completed. Review TickTick before retrying",
    TICKTICK_SYNC_FAILED: "TickTick synchronization failed",
    CONTENT_NOT_FOUND: "Content was not found for this account"
} [code] || "TickTick synchronization failed"),
{
    code,
    statusCode
});

export const createTickTickContentService = (
{
    ContentModel = Content,
    getToken = getTickTickAccessToken,
    createTask = createTickTickTask,
    getProjects = getTickTickProjects,
    analyze = async text => (await import("../utils/generativeAI.js")).default(text)
} = {}) =>
{
    const syncContent = async (
    {
        userId,
        contentId
    }) =>
    {
        if (!/^[a-f0-9]{24}$/i.test(String(contentId))) throw ticktickFailure("CONTENT_NOT_FOUND", 404);
        const owner = {
            _id: contentId,
            userId
        };
        const content = await ContentModel.findOne(owner).select("+integrations.ticktick.claim");
        if (!content || content.userId !== userId) throw ticktickFailure("CONTENT_NOT_FOUND", 404);
        const state = content.integrations?.ticktick ||
        {};
        if (state.status === "synced" && state.taskId) return {
            status: "synced",
            taskId: state.taskId
        };
        // Compatibility read only when the modern execution state is absent.
        if (content.integrations?.tickTickId && !state.status)
            return {
                status: "synced",
                taskId: content.integrations.tickTickId
            };
        if (!content.destinations?.ticktick?.enabled) throw ticktickFailure("TICKTICK_NOT_REQUESTED");
        if (state.status === "uncertain") throw ticktickFailure("TICKTICK_SYNC_UNCERTAIN");
        if (state.claim || state.status === "pending") throw ticktickFailure("TICKTICK_SYNC_IN_PROGRESS");
        const claim = randomUUID();
        const claimed = await ContentModel.findOneAndUpdate(
        {
            ...owner,
            "destinations.ticktick.enabled": true,
            "integrations.ticktick.claim": null,
            "integrations.ticktick.status":
            {
                $nin: ["pending", "synced", "uncertain"]
            }
        },
        {
            $set:
            {
                "integrations.ticktick.status": "pending",
                "integrations.ticktick.claim": claim,
                "integrations.ticktick.phase": "preparing",
                "integrations.ticktick.errorCode": null,
                "integrations.ticktick.lastAttemptAt": new Date()
            }
        },
        {
            new: true,
            runValidators: true
        }).select("_id");
        if (!claimed) throw ticktickFailure("TICKTICK_SYNC_IN_PROGRESS");
        const persist = async values =>
        {
            const updated = await ContentModel.findOneAndUpdate(
            {
                ...owner,
                "integrations.ticktick.claim": claim,
                "integrations.ticktick.status": "pending"
            },
            {
                $set: Object.fromEntries(Object.entries(values).map(([key, value]) => [`integrations.ticktick.${key}`, value]))
            },
            {
                new: true,
                runValidators: true
            }).select("_id");
            if (!updated) throw new Error("Sync persistence failed");
        };
        let writing = false;
        try
        {
            const token = await getToken(userId);
            if (!token) throw ticktickFailure("TICKTICK_NOT_CONNECTED");
            const projects = await getProjects(token);
            if (!Array.isArray(projects) || !projects.some(project => project?.id === content.destinations.ticktick.projectId))
                throw ticktickFailure("TICKTICK_PROJECT_UNAVAILABLE");
            const options = content.destinations.ticktick.options ||
            {};
            let tags = normalizeTags(options.tags || []);
            let summary = null;
            let aiStatus = "not_requested";
            if (options.useAiSummary || options.useAiTags)
            {
                aiStatus = "failed";
                try
                {
                    const generated = await analyze(content.rawText);
                    if (options.useAiSummary && typeof generated.summary === "string" && generated.summary.trim()) summary = generated.summary.slice(0, 20000);
                    if (options.useAiTags && Array.isArray(generated.ai_tags)) tags = normalizeTags([...tags, ...generated.ai_tags.filter(tag => typeof tag === "string").slice(0, 30)]);
                    if ((!options.useAiSummary || summary) && (!options.useAiTags || Array.isArray(generated.ai_tags) && generated.ai_tags.some(tag => typeof tag === "string" && tag.trim()))) aiStatus = "generated";
                }
                catch
                {
                    /* Keep original capture; never fabricate AI output. */
                }
            }
            await persist(
            {
                phase: "creating",
                summary,
                tags,
                aiStatus
            });
            writing = true;
            const task = await createTask(token,
            {
                title: content.title,
                rawText: summary ? options.mergeSummaryWithContent ? `${content.rawText}\n\nSummary:\n${summary}` : summary : content.rawText,
                tags,
                projectId: content.destinations.ticktick.projectId || undefined
            });
            if (typeof task?.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(task.id)) throw new Error("Invalid task acknowledgement");
            const updated = await ContentModel.findOneAndUpdate(
            {
                ...owner,
                "integrations.ticktick.claim": claim,
                "integrations.ticktick.status": "pending"
            },
            {
                $set:
                {
                    "integrations.ticktick.status": "synced",
                    "integrations.ticktick.claim": null,
                    "integrations.ticktick.phase": "complete",
                    "integrations.ticktick.taskId": task.id,
                    // Keep compatibility aliases in the same claimed acknowledgement.
                    // Removing dual writes requires a separate consumer/data migration.
                    "integrations.tickTickId": task.id,
                    "integrations.tickTickProjectId": content.destinations.ticktick.projectId || null
                }
            },
            {
                new: true,
                runValidators: true
            }).select("_id");
            if (!updated) throw new Error("Sync persistence failed");
            return {
                status: "synced",
                taskId: task.id
            };
        }
        catch (error)
        {
            // Never reclaim a lost write acknowledgement, 5xx, or failed persistence.
            const definitive = [400, 401, 403, 404, 422, 429].includes(error?.response?.status);
            const uncertain = writing && !definitive;
            const code = uncertain ? "TICKTICK_SYNC_UNCERTAIN" : ["TICKTICK_NOT_CONNECTED", "TICKTICK_PROJECT_UNAVAILABLE"].includes(error?.code) ? error.code : "TICKTICK_SYNC_FAILED";
            try
            {
                await persist(
                {
                    status: uncertain ? "uncertain" : "failed",
                    claim: uncertain ? claim : null,
                    errorCode: code
                });
            }
            catch
            {
                /* Durable claim still prevents unsafe repeat writes. */
            }
            throw ticktickFailure(code);
        }
    };
    return {
        syncContent
    };
};

export default createTickTickContentService();
