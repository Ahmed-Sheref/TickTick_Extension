import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { fingerprintTickTickCredential, assertTickTickFingerprintConfigured } from "../utils/ticktickCredentialFingerprint.js";

const key = randomBytes(32).toString("hex");
const configure = (t) =>
{
    const names = ["TICKTICK_CREDENTIAL_FINGERPRINT_KEY", "PROVIDER_TOKEN_KEYS", "JWT_SECRET",
        "TICKTICK_CLIENT_SECRET", "TICKTICK_LINK_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"];
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    for (const name of names)
    {
        delete process.env[name];
    }
    process.env.TICKTICK_CREDENTIAL_FINGERPRINT_KEY = key;
    t.after(() =>
    {
        for (const name of names)
        {
            if (previous[name] === undefined)
            {
                delete process.env[name];
            }
            else
            {
                process.env[name] = previous[name];
            }
        }
    });
};

test("fingerprints are deterministic HMAC-SHA256 credential identifiers", t =>
{
    configure(t);
    const token = "exact-issued-token";
    const expected = createHmac("sha256", Buffer.from(key, "hex")).update(token).digest("hex");
    assert.equal(fingerprintTickTickCredential(token), expected);
    assert.equal(fingerprintTickTickCredential(token), fingerprintTickTickCredential(token));
    assert.match(expected, /^[a-f0-9]{64}$/);
});

test("different issued tokens produce different fingerprints, including tokens for one external account", t =>
{
    configure(t);
    assert.notEqual(fingerprintTickTickCredential("old-issued-token"), fingerprintTickTickCredential("reissued-token"));
});

test("changing the secret changes fingerprints and requires a coordinated backfill", t =>
{
    configure(t);
    const before = fingerprintTickTickCredential("token");
    process.env.TICKTICK_CREDENTIAL_FINGERPRINT_KEY = randomBytes(32).toString("hex");
    assert.notEqual(fingerprintTickTickCredential("token"), before);
});

for (const value of [undefined, "", "short", "g".repeat(64), "ab".repeat(31), " ab".repeat(32)])
{
    test(`fingerprinting fails closed for invalid key ${value === undefined ? "missing" : value.length}`, t =>
    {
        configure(t);
        if (value === undefined)
        {
            delete process.env.TICKTICK_CREDENTIAL_FINGERPRINT_KEY;
        }
        else
        {
            process.env.TICKTICK_CREDENTIAL_FINGERPRINT_KEY = value;
        }
        assert.throws(assertTickTickFingerprintConfigured, { code: "TICKTICK_FINGERPRINT_UNAVAILABLE" });
        assert.throws(() => fingerprintTickTickCredential("token"), { code: "TICKTICK_FINGERPRINT_UNAVAILABLE" });
    });
}

for (const name of ["JWT_SECRET", "TICKTICK_CLIENT_SECRET", "TICKTICK_LINK_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"])
{
    test(`fingerprint key cannot reuse ${name}`, t =>
    {
        configure(t);
        process.env[name] = key;
        assert.throws(assertTickTickFingerprintConfigured, { code: "TICKTICK_FINGERPRINT_UNAVAILABLE" });
    });
}

test("fingerprint key cannot reuse an encryption key, regardless of hex case", t =>
{
    configure(t);
    process.env.PROVIDER_TOKEN_KEYS = JSON.stringify({ k1: key.toUpperCase() });
    assert.throws(assertTickTickFingerprintConfigured, { code: "TICKTICK_FINGERPRINT_UNAVAILABLE" });
});

test("invalid tokens are rejected without logging tokens or secret values", t =>
{
    configure(t);
    const log = t.mock.method(console, "log", () => {});
    const error = t.mock.method(console, "error", () => {});
    for (const token of [undefined, "", " ", "a".repeat(16385)])
    {
        assert.throws(() => fingerprintTickTickCredential(token), /Invalid TickTick credential/);
    }
    fingerprintTickTickCredential("private-access-token");
    assert.equal(log.mock.callCount(), 0);
    assert.equal(error.mock.callCount(), 0);
});
