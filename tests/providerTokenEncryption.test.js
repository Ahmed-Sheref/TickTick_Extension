import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptProviderToken, decryptProviderToken, assertTokenEncryptionConfigured } from "../utils/providerTokenEncryption.js";

const context = { userId: "USER_google", provider: "ticktick", tokenType: "access" };
const keyA = randomBytes(32).toString("hex");
const keyB = randomBytes(32).toString("hex");
const secret = "private-provider-token";

const configure = (t) =>
{
    const previous = [process.env.PROVIDER_TOKEN_KEYS, process.env.PROVIDER_TOKEN_ACTIVE_KEY_ID];
    process.env.PROVIDER_TOKEN_KEYS = JSON.stringify({ a: keyA, b: keyB });
    process.env.PROVIDER_TOKEN_ACTIVE_KEY_ID = "a";
    t.after(() =>
    {
        for (const [index, key] of ["PROVIDER_TOKEN_KEYS", "PROVIDER_TOKEN_ACTIVE_KEY_ID"].entries())
        {
            if (previous[index] === undefined)
            {
                delete process.env[key];
            }
            else
            {
                process.env[key] = previous[index];
            }
        }
    });
};

test("AES-256-GCM tokens round trip with randomized nonces", t =>
{
    configure(t);
    const first = encryptProviderToken(secret, context);
    const second = encryptProviderToken(secret, context);
    assert.equal(first.keyId, "a");
    assert.notEqual(first.encryptedToken, second.encryptedToken);
    assert.ok(!first.encryptedToken.includes(secret));
    assert.equal(decryptProviderToken(first.encryptedToken, context), secret);
});

for (const part of [0, 1, 2, 3, 4])
{
    test(`tampered envelope component ${part} is rejected`, t =>
    {
        configure(t);
        const parts = encryptProviderToken(secret, context).encryptedToken.split(".");
        const replacements = ["v2", "b", "0".repeat(24), "0".repeat(32), "AAAA"];
        parts[part] = replacements[part];
        assert.throws(() => decryptProviderToken(parts.join("."), context), { code: "TOKEN_DECRYPTION_FAILED" });
    });
}

for (const changed of [{ userId: "USER_other" }, { provider: "other-provider" }, { tokenType: "refresh" }])
{
    test(`ciphertext is bound to ${Object.keys(changed)[0]}`, t =>
    {
        configure(t);
        const { encryptedToken } = encryptProviderToken(secret, context);
        assert.throws(() => decryptProviderToken(encryptedToken, { ...context, ...changed }),
            { code: "TOKEN_DECRYPTION_FAILED" });
    });
}

test("rotation writes with the active key and reads retained older keys", t =>
{
    configure(t);
    const old = encryptProviderToken(secret, context);
    process.env.PROVIDER_TOKEN_ACTIVE_KEY_ID = "b";
    const next = encryptProviderToken(secret, context);
    assert.equal(next.keyId, "b");
    assert.equal(decryptProviderToken(old.encryptedToken, context), secret);
    assert.equal(decryptProviderToken(next.encryptedToken, context), secret);
    process.env.PROVIDER_TOKEN_KEYS = JSON.stringify({ b: keyB });
    assert.throws(() => decryptProviderToken(old.encryptedToken, context), { code: "TOKEN_DECRYPTION_FAILED" });
});

for (const keys of ["not-json", "null", "[]", JSON.stringify({ a: "short" }), JSON.stringify({ other: keyA })])
{
    test(`invalid encryption configuration fails closed: ${keys.length} characters`, t =>
    {
        configure(t);
        process.env.PROVIDER_TOKEN_KEYS = keys;
        assert.throws(assertTokenEncryptionConfigured, { code: "TOKEN_ENCRYPTION_UNAVAILABLE" });
    });
}

test("missing encryption keys and plaintext/invalid envelopes are rejected", t =>
{
    configure(t);
    assert.throws(() => decryptProviderToken(secret, context), { code: "TOKEN_DECRYPTION_FAILED" });
    assert.throws(() => encryptProviderToken(secret, null), /context/);
    delete process.env.PROVIDER_TOKEN_KEYS;
    assert.throws(() => encryptProviderToken(secret, context), { code: "TOKEN_ENCRYPTION_UNAVAILABLE" });
});
