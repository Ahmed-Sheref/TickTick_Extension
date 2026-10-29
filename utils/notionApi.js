import { imageLimits } from "../services/imageConfig.js";
import notionCredentials from "../services/notionCredentials.js";
import
{
    getNotionLinkConfig
}
from "./notionLinkOAuth.js";
import
{
    notionFailure,
    notionErrors
}
from "./notionErrors.js";
import
{
    notionId
}
from "../validators/notionValidator.js";

export const NOTION_REQUEST_BYTES = 480000; // Headroom below the documented 500KB.
const RESPONSE_BYTES = 2 * 1024 * 1024;
const uuidPath = "[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}";
const routes = {
    GET: new RegExp(`^/(pages|data_sources|databases|file_uploads)/${uuidPath}$`),
    POST: new RegExp(`^/(search|pages|file_uploads|file_uploads/${uuidPath}/send)$`),
    PATCH: new RegExp(`^/blocks/${uuidPath}/children$`)
};

const boundedJson = async response =>
{
    if (!/^application\/json\b/i.test(response.headers.get("content-type") || "") || !response.body)
    {
        await response.body?.cancel();
        throw notionFailure("NOTION_INVALID_RESPONSE");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try
    {
        while (true)
        {
            const
            {
                done,
                value
            } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > RESPONSE_BYTES)
            {
                await reader.cancel();
                throw notionFailure("NOTION_INVALID_RESPONSE");
            }
            chunks.push(Buffer.from(value));
        }
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
        return data;
    }
    catch
    {
        throw notionFailure("NOTION_INVALID_RESPONSE");
    }
    finally
    {
        reader.releaseLock();
    }
};

export const createNotionApiClient = (
{
    credentials = notionCredentials,
    getConfig = getNotionLinkConfig,
    fetchImpl = (...args) => fetch(...args)
} = {}) =>
{
    const request = async (
    {
        userId,
        method,
        path,
        body,
        connection: expectedConnection,
        deadline
    } = {}) =>
    {
        if (!routes[method]?.test(path || "")) throw notionFailure("INVALID_NOTION_INPUT");
        const mutating = method === "PATCH" || (method === "POST" && path !== "/search");
        const multipart = body instanceof FormData;
        if (multipart && (!path.endsWith("/send") || !(body.get("file") instanceof Blob) || body.get("file").size > imageLimits.sizeLimit || body.getAll("file").length !== 1 || [...body.keys()].some(key => key !== "file")))
            throw notionFailure("INVALID_NOTION_INPUT");
        const serialized = multipart ? body : body === undefined ? undefined : JSON.stringify(body);
        if (!multipart && serialized && Buffer.byteLength(serialized) > NOTION_REQUEST_BYTES) throw notionFailure("NOTION_CONTENT_LIMIT");
        const config = getConfig();
        let snapshot = await credentials.getForUser(
        {
            userId,
            expectedConnection
        });
        // Bind even a caller's first request to the identity it actually read.
        const binding = expectedConnection || snapshot.connection;
        const perform = async current =>
        {
            const remaining = deadline === undefined ? 10000 : Math.min(10000, deadline - Date.now());
            if (remaining <= 0) throw notionFailure("NOTION_PROVIDER_UNAVAILABLE");
            let response;
            try
            {
                response = await fetchImpl(`https://api.notion.com/v1${path}`,
                {
                    method,
                    redirect: "error",
                    signal: AbortSignal.timeout(remaining),
                    headers:
                    {
                        Authorization: `Bearer ${current.accessToken}`,
                        "Notion-Version": config.apiVersion,
                        Accept: "application/json",
                        ...(serialized === undefined || multipart ?
                        {} :
                        {
                            "Content-Type": "application/json"
                        })
                    },
                    ...(serialized === undefined ?
                    {} :
                    {
                        body: serialized
                    })
                });
            }
            catch
            {
                throw notionFailure("NOTION_PROVIDER_UNAVAILABLE",
                {
                    ambiguous: mutating
                });
            }
            if (response.status >= 200 && response.status < 300)
            {
                try
                {
                    return {
                        data: await boundedJson(response),
                        connection: current.connection
                    };
                }
                catch
                {
                    throw notionFailure("NOTION_INVALID_RESPONSE",
                    {
                        ambiguous: mutating
                    });
                }
            }
            if (response.status === 401)
            {
                await response.body?.cancel();
                throw Object.assign(notionFailure("NOTION_RECONNECT_REQUIRED"),
                {
                    unauthorized: true
                });
            }
            const retryHeader = response.headers.get("retry-after");
            const retryAfter = /^\d{1,7}$/.test(retryHeader || "") ? Number(retryHeader) : undefined;
            // A failed write may have committed. Retain only an explicitly
            // reported UUID, never the raw response or provider error message.
            let resourceId;
            try
            {
                resourceId = notionId((await boundedJson(response)).additional_data?.committed_resource_id);
            }
            catch
            {
                /* The HTTP status remains authoritative for rejected requests. */
            }
            const code = response.status === 403 ? "NOTION_PERMISSION_DENIED" :
                response.status === 404 ? "NOTION_RESOURCE_NOT_FOUND" :
                response.status === 429 ? "NOTION_RATE_LIMITED" :
                response.status >= 500 ? "NOTION_PROVIDER_UNAVAILABLE" : "NOTION_INVALID_REQUEST";
            throw notionFailure(code,
            {
                retryAfter,
                resourceId,
                ambiguous: mutating && Boolean(resourceId || response.status >= 500 && response.status !== 529 || response.status >= 300 && response.status < 400)
            });
        };
        try
        {
            return await perform(snapshot);
        }
        catch (error)
        {
            if (!error.unauthorized) throw error;
            try
            {
                const current = await credentials.getForUser(
                {
                    userId,
                    expectedConnection: binding
                });
                // Another completed refresh must not cause a second rotation.
                if (current.connection.credentialVersion === snapshot.connection.credentialVersion)
                    await credentials.refreshForUser(
                    {
                        userId
                    });
                snapshot = await credentials.getForUser(
                {
                    userId,
                    expectedConnection: binding
                });
            }
            catch (refreshError)
            {
                if (refreshError?.code === "NOTION_REFRESH_UNAVAILABLE") throw notionFailure("NOTION_REFRESH_UNAVAILABLE");
                if (["NOTION_REFRESH_SUPERSEDED", "NOTION_CONNECTION_CHANGED"].includes(refreshError?.code))
                    throw notionFailure("NOTION_CONNECTION_CHANGED");
                if (Object.hasOwn(notionErrors, refreshError?.code || "") && refreshError.code !== "NOTION_RECONNECT_REQUIRED")
                    throw notionFailure(refreshError.code);
                throw notionFailure("NOTION_RECONNECT_REQUIRED");
            }
            try
            {
                return await perform(snapshot);
            }
            catch (retryError)
            {
                if (retryError.unauthorized)
                {
                    try
                    {
                        await credentials.markRejectedForUser(
                        {
                            userId,
                            connection: snapshot.connection
                        });
                    }
                    catch
                    {
                        /* Never overwrite a newer connection or expose persistence details. */
                    }
                    throw notionFailure("NOTION_RECONNECT_REQUIRED");
                }
                throw retryError;
            }
        }
    };
    return {
        request
    };
};

export default createNotionApiClient();
