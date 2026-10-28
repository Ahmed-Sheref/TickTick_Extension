import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import Content from "../Models/Content.js";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import { encryptProviderToken } from "../utils/providerTokenEncryption.js";
import { createNotionCredentialService } from "../services/notionCredentials.js";
import { createNotionContentService } from "../services/notionContentService.js";
import { ids, savedContent } from "./helpers/notionContentFixture.js";

// Reuses the existing explicitly opt-in disposable Notion test server. Never
// read DATABASE/.env, and never drop a database named by the operator's URI.
const uri = process.env.NOTION_LINK_TEST_MONGODB_URI;
test("disposable MongoDB arbitrates Notion content claims and preserves independent integration metadata",
    { skip: uri ? false : "No disposable MongoDB configured (NOTION_LINK_TEST_MONGODB_URI)", timeout: 30000 }, async t => {
        const dbName = `notion_content_test_${randomBytes(12).toString("hex")}`;
        const connection = await mongoose.createConnection(uri, { dbName, autoIndex: false, serverSelectionTimeoutMS: 5000 }).asPromise();
        try {
            for (const [key, value] of Object.entries({ PROVIDER_TOKEN_KEYS: JSON.stringify({ test: "22".repeat(32) }), PROVIDER_TOKEN_ACTIVE_KEY_ID: "test" })) {
                const before = process.env[key];
                process.env[key] = value;
                t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
            }
            const ContentModel = connection.model("NotionContentTest", Content.schema.clone(), "contents");
            const AccountModel = connection.model("NotionContentAccountTest", ConnectedAccount.schema.clone(), "accounts");
            await Promise.all([ContentModel.createIndexes(), AccountModel.createIndexes()]);
            await ContentModel.create(savedContent());
            await AccountModel.create({ userId: ids.owner, provider: "notion", connected: true,
                providerAccountId: `workspace:${ids.workspace}:user:${ids.person}`,
                encryptedAccessToken: encryptProviderToken("test-only-access", { userId: ids.owner, provider: "notion", tokenType: "access" }).encryptedToken,
                metadata: { workspaceId: ids.workspace, authorizingUserId: ids.person, botId: ids.bot,
                    notionDestination: { id: ids.page, type: "page", selectionId: ids.selection } } });
            const credentials = createNotionCredentialService({ ConnectedAccountModel: AccountModel,
                UserModel: { exists: async ({ userId }) => userId === ids.owner },
                AuthIdentityModel: { exists: async ({ userId, provider }) => userId === ids.owner && provider === "google" },
                getConfig: () => ({ apiVersion: "2026-03-11" }) });
            let creations = 0;
            const service = createNotionContentService({ ContentModel, ConnectedAccountModel: AccountModel, credentials,
                destinations: { verify: async ({ destination }) => ({ destination, titleProperty: null }) },
                api: { request: async request => {
                    assert.equal(request.method, "POST");
                    assert.equal(request.path, "/pages");
                    creations++;
                    // Simulate a different provider completing while Notion's claim is held.
                    await ContentModel.updateOne({ _id: ids.content, userId: ids.owner }, { $set: { "integrations.tickTickId": "parallel-ticktick" } });
                    return { data: { object: "page", id: ids.created, url: "https://www.notion.so/confirmed-test-page" } };
                } } });
            const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.syncContent({ userId: ids.owner, contentId: ids.content })));
            assert.equal(creations, 1);
            assert.ok(results.some(result => result.status === "fulfilled"));
            assert.ok(results.filter(result => result.status === "rejected").every(result => result.reason.code === "NOTION_SYNC_IN_PROGRESS"));
            const stored = await ContentModel.findById(ids.content).select("+integrations.notion.claim");
            assert.equal(stored.integrations.notion.status, "synced");
            assert.equal(stored.integrations.notion.pageId, ids.created);
            assert.equal(stored.integrations.notion.claim, null);
            assert.equal(stored.integrations.tickTickId, "parallel-ticktick");
            const repeated = await service.syncContent({ userId: ids.owner, contentId: ids.content });
            assert.equal(repeated.alreadySynced, true);
            assert.equal(creations, 1);
            await ContentModel.updateOne({ _id: ids.content }, { $set: { "integrations.notion.status": "pending", "integrations.notion.claim": "abandoned" } });
            await assert.rejects(service.syncContent({ userId: ids.owner, contentId: ids.content }), { code: "NOTION_SYNC_IN_PROGRESS" });
            await assert.rejects(service.syncContent({ userId: ids.other, contentId: ids.content }), { code: "NOTION_CONTENT_NOT_FOUND" });
            assert.equal(creations, 1);
        } finally {
            // dbName is generated above with a fixed test prefix, never from URI input.
            assert.match(dbName, /^notion_content_test_[a-f0-9]{24}$/);
            await connection.dropDatabase();
            await connection.close();
        }
    });
