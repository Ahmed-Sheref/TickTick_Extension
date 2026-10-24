import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import ConnectedAccount from "../Models/ConnectedAccount.js";

// Opt-in only. Never reads DATABASE or .env; all writes use an isolated database
// created for this test on an explicitly configured disposable MongoDB server.
const uri = process.env.TICKTICK_LINK_TEST_MONGODB_URI;

test("MongoDB enforces exact TickTick credential uniqueness and atomic reconnect writes",
    { skip: uri ? false : "No disposable MongoDB configured (TICKTICK_LINK_TEST_MONGODB_URI)", timeout: 30000 },
    async () =>
{
    const dbName = `ticktick_link_test_${randomBytes(12).toString("hex")}`;
    const connection = await mongoose.createConnection(uri, { dbName, autoIndex: false,
        serverSelectionTimeoutMS: 5000 }).asPromise();
    try
    {
        const Account = connection.model("ConnectedAccountIndexTest", ConnectedAccount.schema.clone(), "accounts");
        await Account.createIndexes();
        const firstFingerprint = "ab".repeat(32);
        const secondFingerprint = "cd".repeat(32);
        const first = await Account.create({ userId: "USER_first", provider: "ticktick", credentialFingerprint: firstFingerprint });
        const second = await Account.create({ userId: "USER_second", provider: "ticktick", credentialFingerprint: secondFingerprint });
        await assert.rejects(Account.findOneAndUpdate({ _id: second._id }, { $set:
        {
            credentialFingerprint: firstFingerprint,
            encryptedAccessToken: "must-not-replace"
        } }, { new: true, runValidators: true }), { code: 11000 });
        const unchanged = await Account.findById(second._id).select("+credentialFingerprint +encryptedAccessToken");
        assert.equal(unchanged.credentialFingerprint, secondFingerprint);
        assert.equal(unchanged.encryptedAccessToken, null);
        const updated = await Account.findOneAndUpdate({ userId: first.userId, provider: "ticktick" },
            { $set: { credentialFingerprint: "ef".repeat(32), providerAccountId: null } },
            { new: true, upsert: true, runValidators: true });
        assert.equal(String(updated._id), String(first._id));
        assert.equal(updated.createdAt.getTime(), first.createdAt.getTime());
        await Account.create({ userId: "USER_third", provider: "ticktick", credentialFingerprint: firstFingerprint });
        await Account.create({ userId: "USER_placeholder_1", provider: "ticktick" });
        await Account.create({ userId: "USER_placeholder_2", provider: "ticktick" });
        await Account.create({ userId: "USER_notion", provider: "notion", credentialFingerprint: firstFingerprint });
        await assert.rejects(Account.create({ userId: "USER_first", provider: "ticktick" }), { code: 11000 });
        const candidates = ["USER_race_1", "USER_race_2"].map(userId => Account.create(
            { userId, provider: "ticktick", credentialFingerprint: "12".repeat(32) }));
        const results = await Promise.allSettled(candidates);
        assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
        assert.equal(results.find(result => result.status === "rejected").reason.code, 11000);
    }
    finally
    {
        // Only the random database created above is removed, never an existing
        // database supplied in the connection URI.
        await connection.dropDatabase();
        await connection.close();
    }
});
