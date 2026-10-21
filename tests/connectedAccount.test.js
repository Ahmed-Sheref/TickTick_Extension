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
