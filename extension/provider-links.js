/* Provider links contain no credentials. TickTick opens the app, not a task. */
globalThis.KnowviaProviderLinks = Object.freeze({
    notion(value)
    {
        try
        {
            const url = new URL(value);
            return url.protocol === "https:" && !url.username && !url.password && !url.port &&
                /(^|\.)(notion\.so|notion\.site|notion\.com)$/.test(url.hostname) ? url.href : null;
        }
        catch
        {
            return null;
        }
    },
    ticktick(state)
    {
        return state?.status === "synced" && state.requested === true && /^[a-zA-Z0-9_-]{1,100}$/.test(state.taskId || "")
            ? "https://ticktick.com/webapp/" : null;
    }
});
