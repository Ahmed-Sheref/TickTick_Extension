import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const configurationError = () =>
{
    const error = new Error("Provider token encryption is not configured correctly");
    error.statusCode = 503;
    error.code = "TOKEN_ENCRYPTION_UNAVAILABLE";
    return error;
};

const readKeys = () =>
{
    try
    {
        const keys = JSON.parse(process.env.PROVIDER_TOKEN_KEYS || "null");
        const activeKeyId = process.env.PROVIDER_TOKEN_ACTIVE_KEY_ID;
        if (!keys || Array.isArray(keys) || typeof keys !== "object" ||
            !/^[A-Za-z0-9_-]{1,64}$/.test(activeKeyId || "") ||
            !Object.hasOwn(keys, activeKeyId))
        {
            throw configurationError();
        }
        for (const [id, key] of Object.entries(keys))
        {
            if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || typeof key !== "string" || !/^[a-fA-F0-9]{64}$/.test(key))
            {
                throw configurationError();
            }
        }
        return { keys, activeKeyId };
    }
    catch
    {
        throw configurationError();
    }
};

const aad = (keyId, context) =>
{
    if (!context || typeof context.userId !== "string" || !context.userId ||
        typeof context.provider !== "string" || !context.provider ||
        !["access", "refresh"].includes(context.tokenType))
    {
        throw new Error("Provider token encryption context is required");
    }
    return Buffer.from(JSON.stringify(["provider-token", "v1", keyId,
        context.userId, context.provider, context.tokenType]));
};

export const assertTokenEncryptionConfigured = () =>
{
    readKeys();
};

export const encryptProviderToken = (token, context) =>
{
    if (typeof token !== "string" || !token.trim() || token.length > 16384)
    {
        throw new Error("Invalid provider token");
    }
    const { keys, activeKeyId } = readKeys();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(keys[activeKeyId], "hex"), iv);
    cipher.setAAD(aad(activeKeyId, context));
    const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return {
        encryptedToken: ["v1", activeKeyId, iv.toString("hex"),
            cipher.getAuthTag().toString("hex"), ciphertext.toString("base64url")].join("."),
        keyId: activeKeyId
    };
};

export const decryptProviderToken = (encryptedToken, context) =>
{
    try
    {
        if (typeof encryptedToken !== "string" || encryptedToken.length > 33000)
        {
            throw new Error();
        }
        const [version, keyId, iv, tag, ciphertext, extra] = encryptedToken.split(".");
        const { keys } = readKeys();
        if (version !== "v1" || extra !== undefined || !Object.hasOwn(keys, keyId) ||
            !/^[a-f0-9]{24}$/.test(iv || "") || !/^[a-f0-9]{32}$/.test(tag || "") ||
            !/^[A-Za-z0-9_-]+$/.test(ciphertext || ""))
        {
            throw new Error();
        }
        if (Buffer.from(ciphertext, "base64url").toString("base64url") !== ciphertext)
        {
            throw new Error();
        }
        const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keys[keyId], "hex"), Buffer.from(iv, "hex"));
        decipher.setAAD(aad(keyId, context));
        decipher.setAuthTag(Buffer.from(tag, "hex"));
        return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
    }
    catch
    {
        const error = new Error("Provider token could not be decrypted");
        error.code = "TOKEN_DECRYPTION_FAILED";
        error.statusCode = 503;
        throw error;
    }
};
