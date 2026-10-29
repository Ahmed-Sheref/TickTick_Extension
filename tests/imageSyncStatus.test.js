import test from "node:test";
import assert from "node:assert/strict";
import { contentSyncStatus, createContentSyncStatusService, CONTENT_SYNC_STATUS_PROJECTION } from "../services/contentSyncStatusService.js";
import Content from "../Models/Content.js";

test("Mongo status projection contains no parent/child collision and retains private claim checks", () =>
{
    const query = Content.findOne({}).select(CONTENT_SYNC_STATUS_PROJECTION);
    query._applyPaths(); // Exercise Mongoose's actual select:false expansion.
    const fields = Object.keys(query.projection()).map(field => field.replace(/^\+/, ""));
    for (const field of fields) assert.ok(!fields.some(other => other !== field && other.startsWith(field + ".")), field);
    assert.ok(fields.includes("integrations.ticktick.claim"));
    assert.ok(fields.includes("integrations.notion.claim"));
});

test("Notion text and image status remain independent of TickTick and primary content", () =>
{
    const content = { _id: "a".repeat(24), images: ["b".repeat(24)], destinations: { notion: { enabled: true }, ticktick: { enabled: false } },
        integrations: { notion: { status: "partial", phase: "images", errorCode: "NOTION_IMAGE_FAILED", claim: null } } };
    const result = contentSyncStatus(content);
    assert.equal(result.ticktick.status, "not_requested");
    assert.equal(result.notion.textStatus, "synced");
    assert.equal(result.notion.imageStatus, "failed");
    assert.equal(result.notion.retryable, true);
});

test("expired temporary image recovery is not advertised as a safe retry", async () =>
{
    const content = { _id: "a".repeat(24), userId: "owner", images: ["b".repeat(24)], destinations: { notion: { enabled: true } },
        integrations: { notion: { status: "partial", phase: "images", errorCode: "NOTION_IMAGE_FAILED", claim: null } } };
    const service = createContentSyncStatusService({
        ContentModel: { findOne: () => ({ select: async () => content }) },
        AssetModel: { find: () => ({ select: async () => [{ retained: false, status: "deleted", notionStatus: "failed", expiresAt: new Date(0) }] }) }
    });
    const result = await service.getStatus({ userId: "owner", contentId: String(content._id) });
    assert.equal(result.notion.imageStatus, "expired");
    assert.equal(result.notion.retryable, false);
    assert.equal(result.notion.textStatus, "synced");
});

test("incomplete Notion acknowledgments cannot advertise image success", () =>
{
    const result = contentSyncStatus({ _id: "a".repeat(24), images: ["b".repeat(24)],
        destinations: { notion: { enabled: true } }, integrations: { notion: { status: "synced", phase: "complete" } } });
    assert.equal(result.notion.status, "uncertain");
    assert.equal(result.notion.imageStatus, "uncertain");
    assert.equal(result.notion.retryable, false);
});

test("retained-only images do not imply Notion image progress", () =>
{
    const result = contentSyncStatus({ _id: "a".repeat(24), images: ["b".repeat(24)], imageNotionIncluded: false,
        destinations: { notion: { enabled: true } }, integrations: { notion: { status: "pending" } } });
    assert.equal(result.notion.imageStatus, undefined);
});
