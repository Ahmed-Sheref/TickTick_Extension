// Preserve the existing bootstrap representation without teaching primary storage
// about TickTick AI state. Notion queued is projected from saved intent until its
// worker starts: adding a persisted Notion queued state would change its contract.
export const buildInitialIntegrationStates = destinations =>
{
    const integrations = {};

    if (destinations.ticktick.enabled)
    {
        const options = destinations.ticktick.options;
        integrations.ticktick =
        {
            status: "queued",
            projectId: destinations.ticktick.projectId,
            aiStatus: options.useAiSummary || options.useAiTags ? "pending" : "not_requested"
        };
    }

    return integrations;
};
