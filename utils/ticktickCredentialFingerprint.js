import { createHmac } from "node:crypto";

const configurationError = () =>
{
    const error = new Error("TickTick credential fingerprinting is not configured correctly");
    error.code = "TICKTICK_FINGERPRINT_UNAVAILABLE";
    error.statusCode = 503;
    return error;
};

const readKey = () =>
{
    const key = process.env.TICKTICK_CREDENTIAL_FINGERPRINT_KEY;
    if (typeof key !== "string" || !/^[a-fA-F0-9]{64}$/.test(key))
    {
        throw configurationError();
    }
    const reused = value => typeof value === "string" && value.toLowerCase() === key.toLowerCase();
    const otherSecrets = ["JWT_SECRET", "TICKTICK_CLIENT_SECRET", "TICKTICK_LINK_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"];
    if (otherSecrets.some(name => reused(process.env[name])))
    {
        throw configurationError();
    }
    // Check known encryption-key reuse without coupling fingerprinting to the
    // encryption configuration parser. AES configuration is validated separately.
    let encryptionKeys;
    try
    {
        encryptionKeys = JSON.parse(process.env.PROVIDER_TOKEN_KEYS || "{}");
    }
    catch
    {
        encryptionKeys = {};
    }
    if (encryptionKeys && typeof encryptionKeys === "object" && Object.values(encryptionKeys).some(reused))
    {
        throw configurationError();
    }
    return Buffer.from(key, "hex");
};

export const assertTickTickFingerprintConfigured = () =>
{
    readKey();
};

// Identifies an exact issued credential only, never a permanent provider user.
export const fingerprintTickTickCredential = (accessToken) =>
{
    const key = readKey();
    if (typeof accessToken !== "string" || !accessToken.trim() || accessToken.length > 16384)
    {
        throw new Error("Invalid TickTick credential");
    }
    return createHmac("sha256", key).update(accessToken, "utf8").digest("hex");
};
