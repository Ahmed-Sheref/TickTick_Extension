import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import NotionLinkState from "../Models/NotionLinkState.js";

// Explicit opt-in, independent of DATABASE/.env. Only a random database on the
// operator-supplied disposable server can be written or removed by this test.
const uri = process.env.NOTION_LINK_TEST_MONGODB_URI;

test("disposable MongoDB enforces Notion identity/owner indexes, state consumption and refresh claims",
    { skip: uri ? false : "No disposable MongoDB configured (NOTION_LINK_TEST_MONGODB_URI)", timeout: 30000 },
    async () =>
{
    const dbName = `notion_link_test_${randomBytes(12).toString("hex")}`;
    const connection = await mongoose.createConnection(uri, { dbName, autoIndex: false,
        serverSelectionTimeoutMS: 5000 }).asPromise();
    try
    {
        const Account = connection.model("NotionAccountTest", ConnectedAccount.schema.clone(), "accounts");
        const State = connection.model("NotionStateTest", NotionLinkState.schema.clone(), "states");
        await Account.createIndexes();
        await State.createIndexes();
        const identity = "workspace:verified-workspace:user:verified-user";
        const candidates = ["USER_one", "USER_two"].map(userId => Account.findOneAndUpdate(
            { userId, provider: "notion" },
            { $set: { providerAccountId: identity, connected: true, encryptedAccessToken: "test-ciphertext" },
                $setOnInsert: { userId, provider: "notion" } }, { upsert: true, new: true, runValidators: true }));
        const results = await Promise.allSettled(candidates);
        assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
        assert.equal(results.find(result => result.status === "rejected").reason.code, 11000);
        const owner = results.find(result => result.status === "fulfilled").value;
        const other = await Account.create({ userId: "USER_other", provider: "notion",
            providerAccountId: "workspace:verified-workspace:user:different-user", encryptedAccessToken: "keep-access",
            encryptedRefreshToken: "keep-refresh" });
        await assert.rejects(Account.findOneAndUpdate({ _id: other._id }, { $set: { providerAccountId: identity,
            encryptedAccessToken: "must-not-replace", encryptedRefreshToken: "must-not-replace" } }), { code: 11000 });
        const unchanged = await Account.findById(other._id).select("+encryptedAccessToken +encryptedRefreshToken");
        assert.equal(unchanged.encryptedAccessToken, "keep-access");
        assert.equal(unchanged.encryptedRefreshToken, "keep-refresh");
        const reconnected = await Account.findOneAndUpdate({ userId: owner.userId, provider: "notion" },
            { $set: { providerAccountId: "workspace:different-workspace:user:verified-user", encryptedAccessToken: "new-access",
                encryptedRefreshToken: "new-refresh", notionRefreshLock: null } }, { upsert: true, new: true });
        assert.equal(String(owner._id), String(reconnected._id));
        assert.equal(owner.createdAt.getTime(), reconnected.createdAt.getTime());
        await assert.rejects(Account.create({ userId: owner.userId, provider: "notion" }), { code: 11000 });
        const ownerQuery = { userId: owner.userId, provider: "notion", connected: true, notionRefreshLock: null };
        const claims = await Promise.all(["claim-one", "claim-two"].map(lock => Account.findOneAndUpdate(ownerQuery,
            { $set: { notionRefreshLock: lock } }, { new: true }).select("+notionRefreshLock")));
        assert.equal(claims.filter(Boolean).length, 1);
        const claim = claims.find(Boolean).notionRefreshLock;
        await Account.updateOne({ _id: owner._id }, { $set: { notionRefreshLock: null, encryptedAccessToken: "reconnect-wins" } });
        const stale = await Account.findOneAndUpdate({ userId: owner.userId, provider: "notion", notionRefreshLock: claim },
            { $set: { encryptedAccessToken: "stale-refresh" } }, { new: true });
        assert.equal(stale, null);
        const state = { stateHash: randomBytes(32).toString("hex"), userId: owner.userId, extensionRedirectUri: "https://test.chromiumapp.org/notion",
            clientNonce: "n".repeat(43), providerRedirectUri: "https://backend.example/callback", expiresAt: new Date(Date.now() + 600000) };
        await State.create(state);
        await assert.rejects(State.create(state), { code: 11000 });
        const consume = () => State.findOneAndDelete({ stateHash: state.stateHash, expiresAt: { $gt: new Date() } });
        const consumed = await Promise.all([consume(), consume()]);
        assert.equal(consumed.filter(Boolean).length, 1);
        await State.create({ ...state, expiresAt: new Date(Date.now() - 1000) });
        assert.equal(await consume(), null);
        // Existing unrelated provider constraints continue to coexist.
        await Account.create({ userId: owner.userId, provider: "ticktick", providerAccountId: identity });
    }
    finally
    {
        await connection.dropDatabase();
        await connection.close();
    }
});
