const oauthError = (message, statusCode = 502, code = "TICKTICK_OAUTH_FAILED") =>
{
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

export const getTickTickLinkConfig = () =>
{
    const dedicatedClient = Boolean(process.env.TICKTICK_LINK_CLIENT_ID || process.env.TICKTICK_LINK_CLIENT_SECRET);
    const clientId = dedicatedClient ? process.env.TICKTICK_LINK_CLIENT_ID : process.env.TICKTICK_CLIENT_ID;
    const clientSecret = dedicatedClient ? process.env.TICKTICK_LINK_CLIENT_SECRET : process.env.TICKTICK_CLIENT_SECRET;
    const redirectUri = process.env.TICKTICK_LINK_REDIRECT_URI;
    try
    {
        const url = new URL(redirectUri);
        if (!clientId || !clientSecret || url.username || url.password || url.search || url.hash ||
            (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))))
        {
            throw new Error();
        }
    }
    catch
    {
        throw oauthError("TickTick linking is not configured", 503, "TICKTICK_LINK_UNAVAILABLE");
    }
    return { clientId, clientSecret, redirectUri };
};

export const getTickTickLinkAuthUrl = (state, redirectUri) =>
{
    const config = getTickTickLinkConfig();
    if (redirectUri !== config.redirectUri)
    {
        throw oauthError("TickTick linking configuration changed; start again", 400);
    }
    const url = new URL("https://ticktick.com/oauth/authorize");
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri,
        response_type: "code", scope: "tasks:read tasks:write", state }).toString();
    return url.toString();
};

export const exchangeTickTickLinkCode = async (code, redirectUri) =>
{
    const config = getTickTickLinkConfig();
    if (config.redirectUri !== redirectUri)
    {
        throw oauthError("TickTick linking configuration changed; start again", 400);
    }
    try
    {
        const response = await fetch("https://ticktick.com/oauth/token",
        {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(10000),
            headers:
            {
                Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: redirectUri })
        });
        if (!response.ok)
        {
            throw new Error();
        }
        const data = await response.json();
        if (typeof data.access_token !== "string" || !data.access_token.trim() || data.access_token.length > 16384 ||
            (data.refresh_token != null && (typeof data.refresh_token !== "string" || data.refresh_token.length > 16384)) ||
            (data.token_type && data.token_type.toLowerCase() !== "bearer"))
        {
            throw new Error();
        }
        return data;
    }
    catch
    {
        // Never propagate provider response bodies, headers, or fetch exceptions.
        throw oauthError("TickTick authorization code exchange failed");
    }
};
