import { createHash, randomBytes } from "node:crypto";
import User from "../Models/User.js";
import AuthIdentity from "../Models/AuthIdentity.js";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import TickTickLinkState from "../Models/TickTickLinkState.js";
import { assertTokenEncryptionConfigured, encryptProviderToken } from "../utils/providerTokenEncryption.js";
import { getTickTickLinkConfig, getTickTickLinkAuthUrl, exchangeTickTickLinkCode } from "../utils/ticktickLinkOAuth.js";
import { assertTickTickFingerprintConfigured, fingerprintTickTickCredential } from "../utils/ticktickCredentialFingerprint.js";

const failure = (code) =>
{
    const error = new Error(code);
    error.code = code;
    return error;
};
const hashState = state => createHash("sha256").update(state).digest("hex");
const allowedRedirects = () => (process.env.ALLOWED_EXTENSION_REDIRECT_URIS || "")
    .split(",").map(value => value.trim()).filter(Boolean);

export const createTickTickLinkService = (dependencies = {}) =>
{
    const {
        UserModel = User,
        AuthIdentityModel = AuthIdentity,
        ConnectedAccountModel = ConnectedAccount,
        StateModel = TickTickLinkState,
        getConfig = getTickTickLinkConfig,
        getAuthUrl = getTickTickLinkAuthUrl,
        exchangeCode = exchangeTickTickLinkCode,
        getAllowedRedirects = allowedRedirects
    } = dependencies;

    const requireGoogleIdentity = async (userId) =>
    {
        if (!await AuthIdentityModel.exists({ userId, provider: "google" }))
        {
            throw failure("GOOGLE_IDENTITY_REQUIRED");
        }
    };

    const startLink = async ({ userId, redirectUri, clientNonce }) =>
    {
        await requireGoogleIdentity(userId);
        if (typeof redirectUri !== "string" || !getAllowedRedirects().includes(redirectUri) ||
            typeof clientNonce !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(clientNonce))
        {
            throw failure("INVALID_LINK_PARAMETERS");
        }
        try
        {
            const url = new URL(redirectUri);
            if (url.username || url.password || url.search || url.hash ||
                (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))))
            {
                throw new Error();
            }
        }
        catch
        {
            throw failure("INVALID_LINK_PARAMETERS");
        }
        assertTokenEncryptionConfigured();
        assertTickTickFingerprintConfigured();
        const config = getConfig();
        const state = randomBytes(32).toString("base64url");
        const authorizationUrl = getAuthUrl(state, config.redirectUri);
        await StateModel.create({
            stateHash: hashState(state), userId, extensionRedirectUri: redirectUri,
            clientNonce, providerRedirectUri: config.redirectUri,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });
        return { authorizationUrl };
    };

    const completeLink = async ({ state, code, providerError }) =>
    {
        if (typeof state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(state))
        {
            throw failure("INVALID_LINK_STATE");
        }
        // Atomic consumption provides single use, independent of MongoDB TTL cleanup.
        const attempt = await StateModel.findOneAndDelete({
            stateHash: hashState(state), expiresAt: { $gt: new Date() }
        });
        if (!attempt)
        {
            throw failure("INVALID_LINK_STATE");
        }
        if (providerError || typeof code !== "string" || !code.trim() || code.length > 4096)
        {
            throw failure("TICKTICK_LINK_CANCELLED");
        }
        if (!getAllowedRedirects().includes(attempt.extensionRedirectUri))
        {
            throw failure("INVALID_LINK_PARAMETERS");
        }
        if (!await UserModel.exists({ userId: attempt.userId }))
        {
            throw failure("LINK_USER_NOT_FOUND");
        }
        await requireGoogleIdentity(attempt.userId);
        assertTokenEncryptionConfigured();
        assertTickTickFingerprintConfigured();
        const tokens = await exchangeCode(code, attempt.providerRedirectUri);
        const credentialFingerprint = fingerprintTickTickCredential(tokens.access_token);
        const owner = await ConnectedAccountModel.findOne({ provider: "ticktick", credentialFingerprint });
        if (owner && owner.userId !== attempt.userId)
        {
            throw failure("TICKTICK_ACCOUNT_CONFLICT");
        }
        const access = encryptProviderToken(tokens.access_token,
            { userId: attempt.userId, provider: "ticktick", tokenType: "access" });
        const refresh = tokens.refresh_token ? encryptProviderToken(tokens.refresh_token,
            { userId: attempt.userId, provider: "ticktick", tokenType: "refresh" }) : null;
        const values = {
            // Reauthorization can select a different destination. The old ID
            // cannot verify that new account, so clear it in the same write.
            providerAccountId: null,
            credentialFingerprint,
            connected: true, encryptedAccessToken: access.encryptedToken,
            encryptedRefreshToken: refresh?.encryptedToken ?? null,
            tokenKeyId: access.keyId, tokenEncryptedAt: new Date()
        };
        try
        {
            // A single owner-scoped upsert creates the first connection or
            // atomically replaces all credentials on that user's existing row.
            // Unique indexes, not the precheck, arbitrate concurrent claims.
            const updated = await ConnectedAccountModel.findOneAndUpdate(
                { userId: attempt.userId, provider: "ticktick" },
                {
                    $set: values,
                    $setOnInsert: { userId: attempt.userId, provider: "ticktick" }
                },
                { upsert: true, new: true, runValidators: true }
            );
            if (!updated)
            {
                throw failure("TICKTICK_ACCOUNT_CONFLICT");
            }
        }
        catch (error)
        {
            if (error?.code === 11000)
            {
                throw failure("TICKTICK_ACCOUNT_CONFLICT");
            }
            throw error;
        }
        const redirect = new URL(attempt.extensionRedirectUri);
        redirect.searchParams.set("ticktick_link", "connected");
        redirect.searchParams.set("client_nonce", attempt.clientNonce);
        return { redirectUrl: redirect.toString() };
    };

    return { startLink, completeLink };
};

export default createTickTickLinkService();
