const failure = (code = "NOTION_OAUTH_FAILED") => Object.assign(new Error(code), { code });
const text = (value, limit) => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

export const getNotionLinkConfig = () =>
{
    const { NOTION_CLIENT_ID: clientId, NOTION_CLIENT_SECRET: clientSecret,
        NOTION_REDIRECT_URI: redirectUri, NOTION_API_VERSION: apiVersion } = process.env;
    try
    {
        const url = new URL(redirectUri);
        if (!text(clientId, 256) || /[:\s]/.test(clientId) || !text(clientSecret, 4096) ||
            /[\r\n]/.test(clientSecret) || apiVersion !== "2026-03-11" ||
            url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
        {
            throw new Error();
        }
    }
    catch
    {
        throw failure("NOTION_LINK_UNAVAILABLE");
    }
    return { clientId, clientSecret, redirectUri, apiVersion };
};

export const getNotionLinkAuthUrl = (state, redirectUri) =>
{
    const config = getNotionLinkConfig();
    if (redirectUri !== config.redirectUri)
    {
        throw failure("NOTION_LINK_UNAVAILABLE");
    }
    const url = new URL("https://api.notion.com/v1/oauth/authorize");
    url.search = new URLSearchParams({ client_id: config.clientId, response_type: "code",
        owner: "user", redirect_uri: redirectUri, state }).toString();
    return url.toString();
};

export const validateNotionTokens = (data, { identityRequired = true } = {}) =>
{
    if (!data || typeof data !== "object" || Array.isArray(data) || data.error ||
        !text(data.access_token, 16384) || !text(data.refresh_token, 16384) || data.token_type !== "bearer")
    {
        throw failure();
    }
    if (identityRequired && (!uuid(data.workspace_id) || !uuid(data.bot_id) ||
        data.owner?.type !== "user" || !uuid(data.owner?.user?.id)))
    {
        throw failure();
    }
    for (const key of ["workspace_name", "workspace_icon"])
    {
        if (data[key] != null && (typeof data[key] !== "string" || data[key].length > 2048))
        {
            throw failure();
        }
    }
    return data;
};

const requestTokens = async (body, config, identityRequired) =>
{
    try
    {
        const response = await fetch("https://api.notion.com/v1/oauth/token",
        {
            method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
            headers:
            {
                Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
                "Content-Type": "application/json", Accept: "application/json", "Notion-Version": config.apiVersion
            },
            body: JSON.stringify(body)
        });
        if (response.status !== 200 || !/^application\/json\b/i.test(response.headers.get("content-type") || ""))
        {
            await response.body?.cancel();
            throw new Error();
        }
        // Bound the decoded stream as well as any advertised length.
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try
        {
            while (true)
            {
                const { done, value } = await reader.read();
                if (done)
                {
                    break;
                }
                size += value.byteLength;
                if (size > 65536)
                {
                    await reader.cancel();
                    throw new Error();
                }
                chunks.push(Buffer.from(value));
            }
        }
        finally
        {
            reader.releaseLock();
        }
        return validateNotionTokens(JSON.parse(Buffer.concat(chunks).toString("utf8")), { identityRequired });
    }
    catch
    {
        // Raw provider errors, response bodies and transport exceptions never escape.
        throw failure();
    }
};

export const exchangeNotionLinkCode = async (code, redirectUri) =>
{
    const config = getNotionLinkConfig();
    if (redirectUri !== config.redirectUri)
    {
        throw failure("NOTION_LINK_UNAVAILABLE");
    }
    return requestTokens({ grant_type: "authorization_code", code, redirect_uri: redirectUri }, config, true);
};

export const refreshNotionTokens = async refreshToken =>
{
    const config = getNotionLinkConfig();
    if (!text(refreshToken, 16384))
    {
        throw failure();
    }
    return requestTokens({ grant_type: "refresh_token", refresh_token: refreshToken }, config, false);
};
