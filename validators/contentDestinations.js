import normalizeTags from "../utils/normTags.js";
import
{
    notionId
}
from "./notionValidator.js";

export const invalidDestination = message => Object.assign(new Error(message),
{
    statusCode: 400
});
const object = value => value && typeof value === "object" && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));

// Omitted intent is deliberately library-only, including requests from old clients.
export function contentDestinations(payload)
{
    if (["accessToken", "refreshToken", "access_token", "refresh_token", "workspaceId", "providerAccountId"].some(key => Object.hasOwn(payload, key)))
        throw invalidDestination("Provider credentials and identities are not accepted");
    if (payload.destinations !== undefined && !object(payload.destinations)) throw invalidDestination("Invalid destinations");
    const input = payload.destinations ??
    {};
    if (!keys(input, ["ticktick", "notion"])) throw invalidDestination("Unsupported content destinations");
    const result = {};
    for (const provider of ["ticktick", "notion"])
    {
        const value = input[provider] === undefined ?
        {
            enabled: false
        } : input[provider];
        const allowed = provider === "ticktick" ? ["enabled", "projectId"] : ["enabled", "destinationId", "destinationType"];
        if (!keys(value, allowed) || typeof value.enabled !== "boolean") throw invalidDestination(`Invalid ${provider} selection`);
        if (!value.enabled && Object.keys(value).some(key => key !== "enabled")) throw invalidDestination(`Options require ${provider} selection`);
        result[provider] = {
            enabled: value.enabled
        };
        if (provider === "ticktick" && value.enabled)
        {
            const projectId = value.projectId ?? payload.projectId ?? null;
            if (typeof projectId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(projectId)) throw invalidDestination("Choose a TickTick list before saving");
            result.ticktick.projectId = projectId;
        }
        if (provider === "notion" && value.enabled && (value.destinationId !== undefined || value.destinationType !== undefined))
        {
            if (!notionId(value.destinationId) || !["page", "data_source"].includes(value.destinationType)) throw invalidDestination("Invalid Notion destination");
            Object.assign(result.notion,
            {
                id: notionId(value.destinationId),
                type: value.destinationType
            });
        }
    }
    if (payload.ticktickOptions !== undefined && (!result.ticktick.enabled || !keys(payload.ticktickOptions, ["useAiSummary", "useAiTags", "mergeSummaryWithContent", "tags"])))
        throw invalidDestination("Invalid TickTick options");
    const options = payload.ticktickOptions ??
    {};
    for (const key of ["useAiSummary", "useAiTags", "mergeSummaryWithContent"])
        if (options[key] !== undefined && typeof options[key] !== "boolean") throw invalidDestination(`Invalid ${key}`);
    if (options.tags !== undefined && (!Array.isArray(options.tags) || options.tags.length > 30 || options.tags.some(tag => typeof tag !== "string" || !tag.trim() || tag.length > 60)))
        throw invalidDestination("Invalid TickTick tags");
    result.ticktick.options = {
        useAiSummary: options.useAiSummary ?? false,
        useAiTags: options.useAiTags ?? false,
        mergeSummaryWithContent: options.mergeSummaryWithContent ?? false,
        tags: options.tags ?? []
    };
    if (payload.notionOptions !== undefined)
    {
        if (!result.notion.enabled || !keys(payload.notionOptions, ["tags"]))
        {
            throw invalidDestination("Invalid Notion options");
        }
        const tags = payload.notionOptions.tags;
        if (!Array.isArray(tags) || tags.length > 30 || tags.some(tag => typeof tag !== "string" || !tag.trim() || tag.length > 60))
        {
            throw invalidDestination("Invalid Notion tags");
        }
        result.notion.options = { tags: normalizeTags(tags) };
    }
    return result;
}
