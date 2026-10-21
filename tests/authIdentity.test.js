import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import AuthIdentity, { AUTH_PROVIDERS } from "../Models/AuthIdentity.js";

const getIndex = (fields) =>
{
    return authIdentityIndexes.find((index) =>
    {
        const keys = Object.keys(index[0]);
        const expected = Object.keys(fields);

        return keys.length === expected.length
            && expected.every((key) => index[0][key] === fields[key]);
    });
};

const authIdentityIndexes = AuthIdentity.schema.indexes();

test("authentication providers are limited to google", () =>
{
    assert.deepEqual(AUTH_PROVIDERS, ["google"]);
    assert.deepEqual(
        AuthIdentity.schema.path("provider").enumValues,
        ["google"]
    );
});

test("valid google identity validates without changing userId", async () =>
{
    const userId = "USER_4a9f2c1b3e7d8a0f";
    const providerSubject = "108234567890123456789";

    const identity = new AuthIdentity(
    {
        userId,
        provider: "google",
        providerSubject
    });

    await identity.validate();

    assert.equal(identity.userId, userId);
    assert.equal(identity.provider, "google");
    assert.equal(identity.providerSubject, providerSubject);
});

test("userId is required", async () =>
{
    const identity = new AuthIdentity(
    {
        provider: "google",
        providerSubject: "108234567890123456789"
    });

    await assert.rejects(
        () => identity.validate(),
        (error) =>
        {
            assert.equal(error.errors.userId.kind, "required");
            return true;
        }
    );
});

test("providerSubject is required", async () =>
{
    const identity = new AuthIdentity(
    {
        userId: "USER_4a9f2c1b3e7d8a0f",
        provider: "google"
    });

    await assert.rejects(
        () => identity.validate(),
        (error) =>
        {
            assert.equal(error.errors.providerSubject.kind, "required");
            return true;
        }
    );
});

test("invalid authentication provider is rejected", async () =>
{
    const identity = new AuthIdentity(
    {
        userId: "USER_4a9f2c1b3e7d8a0f",
        provider: "ticktick",
        providerSubject: "108234567890123456789"
    });

    await assert.rejects(
        () => identity.validate(),
        (error) =>
        {
            assert.equal(error.errors.provider.kind, "enum");
            return true;
        }
    );
});

test("provider and providerSubject are unique together", () =>
{
    const index = getIndex(
    {
        provider: 1,
        providerSubject: 1
    });

    assert.ok(index);
    assert.equal(index[1].unique, true);
});

test("one google identity per application user", () =>
{
    const index = getIndex(
    {
        userId: 1,
        provider: 1
    });

    assert.ok(index);
    assert.equal(index[1].unique, true);
});

test("identity key is providerSubject not email or access token", () =>
{
    assert.equal(Boolean(AuthIdentity.schema.path("providerSubject")), true);
    assert.equal(Boolean(AuthIdentity.schema.path("email")), false);
    assert.equal(Boolean(AuthIdentity.schema.path("accessToken")), false);
    assert.equal(Boolean(AuthIdentity.schema.path("sub")), false);
});

test("creating an auth identity does not invent an application userId", () =>
{
    const identity = new AuthIdentity(
    {
        provider: "google",
        providerSubject: "108234567890123456789"
    });

    assert.equal(identity.userId, undefined);
    assert.equal("User" in mongoose.models, false);
});
