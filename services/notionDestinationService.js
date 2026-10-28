import
{
    randomUUID
}
from "node:crypto";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import notionCredentials from "./notionCredentials.js";
import notionApi from "../utils/notionApi.js";
import
{
    notionFailure
}
from "../utils/notionErrors.js";
import
{
    destinationInput,
    notionId,
    searchInput
}
from "../validators/notionValidator.js";

export const safeNotionUrl = value =>
{
    try
    {
        if (typeof value !== "string" || value.length > 2000) return null;
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password || url.port ||
            !/(^|\.)(notion\.so|notion\.site|notion\.com)$/.test(url.hostname)) return null;
        return url.href;
    }
    catch
    {
        return null;
    }
};

const titleText = fragments => Array.isArray(fragments) ? fragments.slice(0, 100)
    .map(value => typeof value?.plain_text === "string" ? value.plain_text :
        typeof value?.text?.content === "string" ? value.text.content : "").join("").trim().slice(0, 500) : "";

const normalize = resource =>
{
    const pageTitle = resource.properties && typeof resource.properties === "object" ?
        Object.values(resource.properties).find(value => value?.type === "title")?.title : null;
    const title = titleText(resource.object === "page" ? pageTitle : resource.title);
    return {
        id: notionId(resource.id),
        type: resource.object,
        title: title || (resource.object === "page" ? "Untitled page" : "Untitled data source"),
        url: safeNotionUrl(resource.url),
        lastEditedTime: typeof resource.last_edited_time === "string" && Number.isFinite(Date.parse(resource.last_edited_time)) ?
            resource.last_edited_time : null
    };
};

export const selectedNotionDestination = connection =>
{
    const destination = connection.destination;
    if (!destination) throw notionFailure("NOTION_DESTINATION_REQUIRED");
    if (!notionId(destination.id) || !["page", "data_source"].includes(destination.type) || !notionId(destination.selectionId))
        throw notionFailure("NOTION_DESTINATION_INVALID");
    return {
        id: notionId(destination.id),
        type: destination.type,
        selectionId: notionId(destination.selectionId)
    };
};

export const createNotionDestinationService = (
{
    api = notionApi,
    credentials = notionCredentials,
    ConnectedAccountModel = ConnectedAccount
} = {}) =>
{
    const discover = async (
    {
        userId,
        query = {}
    }) =>
    {
        const body = searchInput(query);
        const
        {
            data
        } = await api.request(
        {
            userId,
            method: "POST",
            path: "/search",
            body
        });
        if (data.object !== "list" || !Array.isArray(data.results) || data.results.length > 50 ||
            typeof data.has_more !== "boolean" || (data.has_more && !notionId(data.next_cursor)) ||
            (!data.has_more && data.next_cursor != null)) throw notionFailure("NOTION_INVALID_RESPONSE");
        const results = [];
        for (const resource of data.results)
        {
            if (!["page", "data_source"].includes(resource?.object)) continue;
            if (!notionId(resource.id)) throw notionFailure("NOTION_INVALID_RESPONSE");
            if (resource.in_trash || resource.is_archived) continue;
            results.push(normalize(resource));
        }
        return {
            destinations: results,
            hasMore: data.has_more,
            nextCursor: data.has_more ? notionId(data.next_cursor) : null
        };
    };

    const verify = async (
    {
        userId,
        destination,
        connection,
        deadline
    }) =>
    {
        let
        {
            id,
            type
        } = destinationInput(
        {
            destinationId: destination?.id,
            destinationType: destination?.type
        });
        let response = await api.request(
        {
            userId,
            method: "GET",
            path: `/${type === "page" ? "pages" : type === "database" ? "databases" : "data_sources"}/${id}`,
            connection,
            deadline
        });
        const assertResource = (data, expectedType, expectedId) =>
        {
            if (data.object !== expectedType || notionId(data.id) !== expectedId) throw notionFailure("NOTION_INVALID_RESPONSE");
            if (data.in_trash || data.is_archived) throw notionFailure("NOTION_DESTINATION_INVALID");
        };
        assertResource(response.data, type, id);
        if (type === "database")
        {
            // Modern databases are containers. Never pick one of several sources.
            if (!Array.isArray(response.data.data_sources) || response.data.data_sources.length !== 1 ||
                !notionId(response.data.data_sources[0]?.id)) throw notionFailure("NOTION_DATABASE_AMBIGUOUS");
            const databaseId = id;
            id = notionId(response.data.data_sources[0].id);
            type = "data_source";
            response = await api.request(
            {
                userId,
                method: "GET",
                path: `/data_sources/${id}`,
                connection: connection || response.connection,
                deadline
            });
            assertResource(response.data, type, id);
            if (notionId(response.data.parent?.database_id) !== databaseId) throw notionFailure("NOTION_INVALID_RESPONSE");
        }
        let titleProperty = null;
        if (type === "data_source")
        {
            const properties = response.data.properties;
            if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw notionFailure("NOTION_SCHEMA_INVALID");
            const titles = Object.entries(properties).filter(([, value]) => value?.type === "title");
            if (titles.length !== 1 || typeof titles[0][1].id !== "string" || !titles[0][1].id.trim() ||
                titles[0][1].id.length > 200 || !titles[0][0].trim()) throw notionFailure("NOTION_SCHEMA_INVALID");
            titleProperty = titles[0][1].id;
        }
        return {
            destination:
            {
                ...normalize(response.data),
                id,
                type
            },
            titleProperty,
            connection: response.connection
        };
    };

    const persist = async (userId, connection, selection) =>
    {
        let updated;
        try
        {
            updated = await ConnectedAccountModel.findOneAndUpdate(
            {
                _id: connection.accountId,
                userId,
                provider: "notion",
                connected: true,
                providerAccountId: connection.providerAccountId,
                encryptedAccessToken: connection.credentialVersion
            },
            {
                $set:
                {
                    "metadata.notionDestination": selection
                }
            },
            {
                new: true,
                runValidators: true
            }).select("_id");
        }
        catch
        {
            throw notionFailure("NOTION_PERSISTENCE_FAILED");
        }
        if (!updated) throw notionFailure("NOTION_CONNECTION_CHANGED");
    };
    const select = async (
    {
        userId,
        body
    }) =>
    {
        const verified = await verify(
        {
            userId,
            destination: destinationInput(body)
        });
        await persist(userId, verified.connection,
        {
            id: verified.destination.id,
            type: verified.destination.type,
            selectionId: randomUUID()
        });
        return {
            destination: verified.destination
        };
    };
    const getSelection = async (
    {
        userId
    }) =>
    {
        const
        {
            connection
        } = await credentials.getForUser(
        {
            userId
        });
        if (!connection.destination) return {
            destination: null
        };
        const
        {
            id,
            type
        } = selectedNotionDestination(connection);
        return {
            destination:
            {
                id,
                type
            }
        };
    };
    const clear = async (
    {
        userId
    }) =>
    {
        const
        {
            connection
        } = await credentials.getForUser(
        {
            userId
        });
        await persist(userId, connection, null);
        return {
            destination: null
        };
    };
    return {
        discover,
        verify,
        select,
        getSelection,
        clear
    };
};

export default createNotionDestinationService();
