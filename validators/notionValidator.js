import
{
    notionFailure
}
from "../utils/notionErrors.js";

export const notionId = value =>
{
    if (typeof value !== "string") return null;
    const compact = value.replaceAll("-", "");
    if (!/^[a-f0-9]{32}$/i.test(compact) ||
        !(/^[a-f0-9]{32}$/i.test(value) || /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))) return null;
    return compact.toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
};

export const destinationInput = body =>
{
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some(key => !["destinationId", "destinationType"].includes(key)) || !notionId(body.destinationId))
        throw notionFailure("INVALID_NOTION_INPUT");
    if (!["page", "data_source", "database"].includes(body.destinationType))
        throw notionFailure("NOTION_DESTINATION_UNSUPPORTED");
    return {
        id: notionId(body.destinationId),
        type: body.destinationType
    };
};

export const searchInput = (
{
    query,
    cursor,
    ...extra
} = {}) =>
{
    if (Object.keys(extra).length || (query !== undefined &&
            (typeof query !== "string" || query.length > 200 || /[\u0000-\u001f]/.test(query))) ||
        (cursor !== undefined && !notionId(cursor))) throw notionFailure("INVALID_NOTION_INPUT");
    return {
        ...(query?.trim() ?
        {
            query: query.trim()
        } :
        {}),
        ...(cursor ?
        {
            start_cursor: notionId(cursor)
        } :
        {}),
        page_size: 50
    };
};

export const contentIdInput = value =>
{
    if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) throw notionFailure("INVALID_NOTION_INPUT");
    return value.toLowerCase();
};
