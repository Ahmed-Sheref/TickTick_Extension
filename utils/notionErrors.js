// Only these fixed messages/codes may cross the Notion HTTP boundary.
export const notionErrors = Object.freeze(
{
    NOTION_IMAGE_EXPIRED: [410, "Temporary images expired. Save a new capture with the original files."],
    NOTION_IMAGE_FAILED: [503, "Notion images need attention. Retry the incomplete image work."],
    NOTION_NOT_REQUESTED: [409, "Notion was not requested for this capture"],
    INVALID_NOTION_INPUT: [400, "Invalid Notion request parameters"],
    GOOGLE_IDENTITY_REQUIRED: [403, "A Google-backed application account is required"],
    NOTION_NOT_CONNECTED: [409, "Connect a Notion account first"],
    NOTION_RECONNECT_REQUIRED: [409, "Reconnect your Notion account"],
    NOTION_REFRESH_UNAVAILABLE: [409, "Notion credential refresh is already claimed; retry later or reconnect"],
    NOTION_CONNECTION_CHANGED: [409, "The Notion connection or selection changed; retry with the current selection"],
    NOTION_LINK_UNAVAILABLE: [503, "Notion is not configured correctly"],
    TOKEN_ENCRYPTION_UNAVAILABLE: [503, "Provider token encryption is not configured correctly"],
    NOTION_DESTINATION_REQUIRED: [409, "Select a Notion destination first"],
    NOTION_DESTINATION_UNSUPPORTED: [422, "This Notion destination type is not supported"],
    NOTION_DESTINATION_INVALID: [422, "The Notion destination is unavailable or in trash"],
    NOTION_SCHEMA_INVALID: [422, "The Notion data source needs one usable title property"],
    NOTION_DATABASE_AMBIGUOUS: [422, "Choose a specific data source from this database"],
    NOTION_PERMISSION_DENIED: [403, "The Notion connection lacks permission for this operation"],
    NOTION_RESOURCE_NOT_FOUND: [404, "The Notion resource does not exist or is not shared with this connection"],
    NOTION_INVALID_REQUEST: [422, "Notion rejected the operation; check the destination and content"],
    NOTION_RATE_LIMITED: [429, "Notion is rate limited; retry after the indicated delay"],
    NOTION_PROVIDER_UNAVAILABLE: [503, "Notion is temporarily unavailable"],
    NOTION_INVALID_RESPONSE: [502, "Notion returned an unexpected response"],
    NOTION_CONTENT_NOT_FOUND: [404, "Content was not found for this account"],
    NOTION_INVALID_CONTENT: [422, "The saved content cannot be represented safely in Notion"],
    NOTION_CONTENT_LIMIT: [422, "The saved content exceeds the supported Notion synchronization limits"],
    NOTION_SYNC_IN_PROGRESS: [409, "Notion synchronization is already claimed; an interrupted attempt needs reconciliation"],
    NOTION_SYNC_UNCERTAIN: [409, "A Notion write may have completed; reconcile the saved page before retrying"],
    NOTION_SYNC_CONFLICT: [409, "The content or destination changed since the partial Notion save"],
    NOTION_PERSISTENCE_FAILED: [503, "Notion synchronization state could not be persisted"],
    NOTION_SYNC_FAILED: [500, "Notion synchronization failed"]
});

export const notionFailure = (code, details = {}) =>
{
    const safeCode = typeof code === "string" && Object.hasOwn(notionErrors, code) ? code : "NOTION_SYNC_FAILED";
    const [statusCode, message] = notionErrors[safeCode];
    return Object.assign(new Error(message),
    {
        code: safeCode,
        statusCode,
        ambiguous: Boolean(details.ambiguous),
        ...(Number.isInteger(details.retryAfter) ?
        {
            retryAfter: details.retryAfter
        } :
        {}),
        ...(details.resourceId ?
        {
            resourceId: details.resourceId
        } :
        {})
    });
};

export const safeNotionFailure = error => notionFailure(error?.code,
{
    ambiguous: error?.ambiguous,
    retryAfter: error?.retryAfter
});
