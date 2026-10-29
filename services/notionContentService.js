import notionImages from "./notionImageService.js";
import
{
    randomUUID,
    createHash
}
from "node:crypto";
import Content from "../Models/Content.js";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import notionCredentials from "./notionCredentials.js";
import notionDestinationService,
{
    safeNotionUrl,
    selectedNotionDestination
}
from "./notionDestinationService.js";
import notionApi from "../utils/notionApi.js";
import
{
    mapNotionContent,
    notionTagProperties,
    nextNotionBatch
}
from "../utils/notionContentBlocks.js";
import
{
    notionFailure,
    safeNotionFailure
}
from "../utils/notionErrors.js";
import
{
    contentIdInput,
    notionId
}
from "../validators/notionValidator.js";

const resultFor = (state, alreadySynced) => (
{
    status: "synced",
    pageId: state.pageId,
    pageUrl: state.pageUrl,
    alreadySynced
});

export const createNotionContentService = (
{
    ContentModel = Content,
    ConnectedAccountModel = ConnectedAccount,
    credentials = notionCredentials,
    destinations = notionDestinationService,
    api = notionApi,
    images = notionImages
} = {}) =>
{
    const syncContent = async (
    {
        userId,
        contentId
    }) =>
    {
        const owner = {
            _id: contentIdInput(String(contentId)),
            userId
        };
        let content;
        try
        {
            content = await ContentModel.findOne(owner).select("+integrations.notion.claim");
        }
        catch
        {
            throw notionFailure("NOTION_PERSISTENCE_FAILED");
        }
        // Use exactly the same 404 for another owner's record and a missing ID.
        if (!content || content.userId !== userId) throw notionFailure("NOTION_CONTENT_NOT_FOUND");
        // Legacy records may still be exported by an explicit manual POST. New
        // captures must retain the provider intent recorded at creation.
        if (content.destinations && !content.destinations.notion?.enabled) throw notionFailure("NOTION_NOT_REQUESTED");
        const state = content.integrations?.notion ||
        {};
        if (state.status === "uncertain") throw notionFailure("NOTION_SYNC_UNCERTAIN");
        if (state.claim || state.status === "pending") throw notionFailure("NOTION_SYNC_IN_PROGRESS");
        const
        {
            connection
        } = await credentials.getForUser(
        {
            userId
        });
        const selection = selectedNotionDestination(connection);
        if (state.status === "synced")
        {
            if (!notionId(state.pageId) || !safeNotionUrl(state.pageUrl)) throw notionFailure("NOTION_SYNC_UNCERTAIN");
            return resultFor(state, true);
        }
        const requested = content.destinations?.notion;
        if (requested?.enabled && (requested.id !== selection.id || requested.type !== selection.type ||
                requested.selectionId !== selection.selectionId || requested.connectionId !== connection.accountId ||
                requested.connectionIdentity !== connection.providerAccountId || requested.workspaceId !== connection.workspaceId))
            throw notionFailure("NOTION_SYNC_CONFLICT");
        if (state.pageId && state.status !== "partial") throw notionFailure("NOTION_SYNC_UNCERTAIN");
        const mapped = mapNotionContent(content);
        if (content.images?.length && content.imageNotionIncluded !== false)
            mapped.contentHash = createHash("sha256").update(mapped.contentHash).update(JSON.stringify(content.images.map(String))).digest("hex");
        if (state.pageId && (state.contentHash !== mapped.contentHash || state.destinationId !== selection.id ||
                state.destinationType !== selection.type || state.connectionId !== connection.accountId ||
                state.connectionIdentity !== connection.providerAccountId || state.workspaceId !== connection.workspaceId ||
                !notionId(state.pageId) || !Number.isInteger(state.blocksWritten) || state.blocksWritten < 0 ||
                state.blocksWritten > mapped.blocks.length)) throw notionFailure("NOTION_SYNC_CONFLICT");

        if (content.images?.length && content.imageNotionIncluded !== false) await images.validate({ content });
        const deadline = Date.now() + 60000;
        const binding = {
            ...connection,
            selectionId: selection.selectionId
        };
        const verified = await destinations.verify(
        {
            userId,
            destination: selection,
            connection: binding,
            deadline
        });
        if (state.pageId)
        {
            const
            {
                data: existing
            } = await api.request(
            {
                userId,
                method: "GET",
                path: `/pages/${state.pageId}`,
                connection: binding,
                deadline
            });
            if (existing.object !== "page" || notionId(existing.id) !== state.pageId || existing.in_trash ||
                notionId(existing.parent?.[selection.type === "page" ? "page_id" : "data_source_id"]) !== selection.id)
                throw notionFailure("NOTION_SYNC_CONFLICT");
        }
        const claim = randomUUID();
        let pageId = state.pageId || null;
        let pageUrl = state.pageUrl || null;
        let blocksWritten = state.blocksWritten || 0;
        let unresolvedWrite = false;
        let claimed;
        try
        {
            claimed = await ContentModel.findOneAndUpdate(
            {
                ...owner,
                "integrations.notion.claim": null,
                "integrations.notion.pageId": pageId,
                "integrations.notion.status":
                {
                    $nin: ["pending", "synced", "uncertain"]
                }
            },
            {
                $set:
                {
                    "integrations.notion.status": "pending",
                    "integrations.notion.claim": claim,
                    "integrations.notion.phase": pageId ? "appending" : "preparing",
                    "integrations.notion.pageId": pageId,
                    "integrations.notion.pageUrl": pageUrl,
                    "integrations.notion.destinationId": selection.id,
                    "integrations.notion.destinationType": selection.type,
                    "integrations.notion.connectionId": connection.accountId,
                    "integrations.notion.connectionIdentity": connection.providerAccountId,
                    "integrations.notion.workspaceId": connection.workspaceId,
                    "integrations.notion.contentHash": mapped.contentHash,
                    "integrations.notion.blocksWritten": blocksWritten,
                    "integrations.notion.totalBlocks": mapped.blocks.length,
                    "integrations.notion.lastAttemptAt": new Date(),
                    "integrations.notion.errorCode": null
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
        if (!claimed) throw notionFailure("NOTION_SYNC_IN_PROGRESS");

        const persist = async values =>
        {
            try
            {
                const updated = await ContentModel.findOneAndUpdate(
                {
                    ...owner,
                    "integrations.notion.claim": claim,
                    "integrations.notion.status": "pending"
                },
                {
                    $set: Object.fromEntries(Object.entries(values).map(([key, value]) => [`integrations.notion.${key}`, value]))
                },
                {
                    new: true,
                    runValidators: true
                }).select("_id");
                if (!updated) throw new Error();
            }
            catch
            {
                throw notionFailure("NOTION_PERSISTENCE_FAILED");
            }
        };
        const write = async (method, path, body) =>
        {
            try
            {
                const response = await api.request(
                {
                    userId,
                    method,
                    path,
                    body,
                    connection: binding,
                    deadline
                });
                unresolvedWrite = true; // Cleared only after the acknowledgement is persisted.
                return response.data;
            }
            catch (error)
            {
                if (error.ambiguous) unresolvedWrite = true;
                if (!pageId && notionId(error.resourceId)) pageId = notionId(error.resourceId);
                throw error;
            }
        };
        try
        {
            if (!pageId)
            {
                const base = {
                    parent: selection.type === "page" ?
                    {
                        type: "page_id",
                        page_id: selection.id
                    } :
                    {
                        type: "data_source_id",
                        data_source_id: selection.id
                    },
                    properties:
                    {
                        ...(selection.type === "data_source" ? notionTagProperties(content, verified) : {}),
                        [selection.type === "page" ? "title" : verified.titleProperty]:
                        {
                            type: "title",
                            title: mapped.title
                        }
                    }
                };
                const children = nextNotionBatch(mapped.blocks, 0, base);
                await persist(
                {
                    phase: "creating"
                });
                const created = await write("POST", "/pages",
                {
                    ...base,
                    children
                });
                pageId = notionId(created.id);
                pageUrl = safeNotionUrl(created.url);
                if (created.object !== "page" || !pageId || !pageUrl) throw notionFailure("NOTION_INVALID_RESPONSE",
                {
                    ambiguous: true
                });
                blocksWritten = children.length;
                await persist(
                {
                    pageId,
                    pageUrl,
                    blocksWritten,
                    phase: "appending"
                });
                unresolvedWrite = false;
            }
            while (blocksWritten < mapped.blocks.length)
            {
                const base = {
                    position:
                    {
                        type: "end"
                    }
                };
                const children = nextNotionBatch(mapped.blocks, blocksWritten, base);
                const appended = await write("PATCH", `/blocks/${pageId}/children`,
                {
                    ...base,
                    children
                });
                if (appended.object !== "list" || !Array.isArray(appended.results) || appended.results.length !== children.length ||
                    appended.results.some(block => block.object !== "block" || !notionId(block.id)))
                    throw notionFailure("NOTION_INVALID_RESPONSE",
                    {
                        ambiguous: true
                    });
                blocksWritten += children.length;
                await persist(
                {
                    blocksWritten
                });
                unresolvedWrite = false;
            }
            if (!safeNotionUrl(pageUrl)) throw notionFailure("NOTION_SYNC_UNCERTAIN",
            {
                ambiguous: true
            });
            if (content.images?.length && content.imageNotionIncluded !== false)
            {
                await persist({ phase: "images" });
                await images.sync({ content, pageId, connection: binding, deadline });
            }
            await persist(
            {
                status: "synced",
                phase: "complete",
                claim: null,
                errorCode: null
            });
            return resultFor(
            {
                pageId,
                pageUrl
            }, false);
        }
        catch (error)
        {
            const uncertain = unresolvedWrite || error.ambiguous;
            const safe = safeNotionFailure(error);
            try
            {
                await persist(
                {
                    status: uncertain ? "uncertain" : pageId ? "partial" : "failed",
                    claim: uncertain ? claim : null,
                    pageId,
                    pageUrl,
                    blocksWritten,
                    errorCode: safe.code
                });
            }
            catch
            {
                /* The durable claim still prohibits blind retries after a database outage. */
            }
            if (uncertain) throw notionFailure("NOTION_SYNC_UNCERTAIN");
            throw safe;
        }
    };

    const syncIfSelected = async (
    {
        userId,
        contentId
    }) =>
    {
        const content = await ContentModel.findOne(
        {
            _id: contentIdInput(String(contentId)),
            userId
        }).select("userId destinations");
        if (!content || content.userId !== userId || !content.destinations?.notion?.enabled) return {
            status: "skipped"
        };
        try
        {
            return await syncContent(
            {
                userId,
                contentId
            });
        }
        catch (error)
        {
            // Record failures before a claim too (e.g. revoked credentials). Never
            // overwrite an active claim, partial page, or uncertain acknowledgement.
            try
            {
                await ContentModel.findOneAndUpdate(
                {
                    _id: contentId,
                    userId,
                    "integrations.notion.claim": null,
                    "integrations.notion.pageId": null,
                    "integrations.notion.status":
                    {
                        $nin: ["pending", "synced", "partial", "uncertain"]
                    }
                },
                {
                    $set:
                    {
                        "integrations.notion.status": "failed",
                        "integrations.notion.errorCode": safeNotionFailure(error).code
                    }
                },
                {
                    new: true,
                    runValidators: true
                }).select("_id");
            }
            catch
            {
                /* A later read/retry can recover unclaimed work. */
            }
            throw error;
        }
    };
    return {
        syncContent,
        syncIfSelected
    };
};

export default createNotionContentService();
