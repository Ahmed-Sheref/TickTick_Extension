import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import ConnectedAccount, { PROVIDERS } from "../Models/ConnectedAccount.js";

const getIndex = (fields) =>
{
    return connectedAccountIndexes.find((index) =>
    {
        const keys = Object.keys(index[0]);
        const expected = Object.keys(fields);

        return keys.length === expected.length
            && expected.every((key) => index[0][key] === fields[key]);
    });
};

const connectedAccountIndexes = ConnectedAccount.schema.indexes();

test("providers are limited to ticktick and notion", () =>
{
    assert.deepEqual(PROVIDERS, ["ticktick", "notion"]);
    assert.deepEqual(
        ConnectedAccount.schema.path("provider").enumValues,
        ["ticktick", "notion"]
    );
});

test("valid ticktick account validates without changing userId", async () =>
{
    const userId = "USER_4a9f2c1b3e7d8a0f";

    const account = new ConnectedAccount(
    {
        userId,
        provider: "ticktick",
        connected: true,
        providerAccountId: "ticktick-stable-id",
        metadata:
        {
            displayName: "TickTick"
        }
    });

    await account.validate();

    assert.equal(account.userId, userId);
    assert.equal(account.provider, "ticktick");
    assert.equal(account.connected, true);
});

test("valid notion account validates", async () =>
{
    const account = new ConnectedAccount(
    {
        userId: "USER_4a9f2c1b3e7d8a0f",
        provider: "notion"
    });

    await account.validate();

    assert.equal(account.provider, "notion");
    assert.equal(account.connected, false);
    assert.equal(account.providerAccountId, null);
});

test("userId is required", async () =>
{
    const account = new ConnectedAccount(
    {
        provider: "notion"
    });

    await assert.rejects(
        () => account.validate(),
        (error) =>
        {
            assert.equal(error.errors.userId.kind, "required");
            return true;
        }
    );
});

test("invalid provider is rejected", async () =>
{
    const account = new ConnectedAccount(
    {
        userId: "USER_4a9f2c1b3e7d8a0f",
        provider: "google"
    });

    await assert.rejects(
        () => account.validate(),
        (error) =>
        {
            assert.equal(error.errors.provider.kind, "enum");
            return true;
        }
    );
});

test("one connected account per user and provider", () =>
{
    const index = getIndex(
    {
        userId: 1,
        provider: 1
    });

    assert.ok(index);
    assert.equal(index[1].unique, true);
});

test("stable provider account ids are unique per provider", () =>
{
    const index = getIndex(
    {
        provider: 1,
        providerAccountId: 1
    });

    assert.ok(index);
    assert.equal(index[1].unique, true);
    assert.deepEqual(
        index[1].partialFilterExpression,
        {
            providerAccountId:
            {
                $type: "string"
            }
        }
    );
});

test("token fields are ciphertext-only and hidden by default", () =>
{
    const encryptedAccessToken = ConnectedAccount.schema.path("encryptedAccessToken");
    const encryptedRefreshToken = ConnectedAccount.schema.path("encryptedRefreshToken");

    assert.equal(Boolean(ConnectedAccount.schema.path("accessToken")), false);
    assert.equal(Boolean(ConnectedAccount.schema.path("refreshToken")), false);
    assert.equal(encryptedAccessToken.options.select, false);
    assert.equal(encryptedRefreshToken.options.select, false);
    assert.equal(ConnectedAccount.schema.path("tokenKeyId").instance, "String");
    assert.equal(ConnectedAccount.schema.path("tokenEncryptedAt").instance, "Date");
});

test("creating a connected account does not invent an application userId", () =>
{
    const account = new ConnectedAccount(
    {
        provider: "ticktick"
    });

    assert.equal(account.userId, undefined);
    assert.equal("User" in mongoose.models, false);
});


test("TickTick credentials have a unique partial fingerprint index without replacing existing ownership indexes", () =>
{
    const index = getIndex({ provider: 1, credentialFingerprint: 1 });
    assert.ok(index);
    assert.equal(index[1].unique, true);
    assert.equal(index[1].name, "ticktick_credential_fingerprint_unique");
    assert.deepEqual(index[1].partialFilterExpression,
    {
        provider: "ticktick",
        credentialFingerprint: { $type: "string" }
    });
    assert.equal(getIndex({ userId: 1, provider: 1 })[1].unique, true);
    assert.equal(getIndex({ provider: 1, providerAccountId: 1 })[1].unique, true);
});

test("fingerprints are optional and excluded from ordinary account queries", async () =>
{
    const account = new ConnectedAccount({ userId: "USER_existing", provider: "ticktick" });
    await account.validate();
    assert.equal(account.credentialFingerprint, null);
    assert.equal(account.providerAccountId, null);
    assert.equal(ConnectedAccount.schema.path("credentialFingerprint").options.select, false);
});

test("a credential fingerprint does not manufacture a provider identity or alter Notion identity", async () =>
{
    const account = new ConnectedAccount({ userId: "USER_existing", provider: "ticktick", credentialFingerprint: "ab".repeat(32) });
    await account.validate();
    assert.equal(account.providerAccountId, null);
    const notion = new ConnectedAccount({ userId: "USER_existing", provider: "notion", providerAccountId: "notion-workspace" });
    await notion.validate();
    assert.equal(notion.providerAccountId, "notion-workspace");
    assert.equal(notion.credentialFingerprint, null);
});

test("populated fingerprints must be canonical 64-character hex digests", async () =>
{
    for (const credentialFingerprint of ["", "token", "g".repeat(64)])
    {
        const account = new ConnectedAccount({ userId: "USER_existing", provider: "ticktick", credentialFingerprint });
        await assert.rejects(account.validate(), /credentialFingerprint/);
    }
});
