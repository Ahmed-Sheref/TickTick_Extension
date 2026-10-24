import { createHash, randomBytes } from "node:crypto";
import User from "../Models/User.js";
import AuthIdentity from "../Models/AuthIdentity.js";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import NotionLinkState from "../Models/NotionLinkState.js";
import { assertTokenEncryptionConfigured, encryptProviderToken } from "../utils/providerTokenEncryption.js";
import { getNotionLinkConfig, getNotionLinkAuthUrl, exchangeNotionLinkCode,
    validateNotionTokens } from "../utils/notionLinkOAuth.js";

const failure = code => Object.assign(new Error(code), { code });
const hashState = state => createHash("sha256").update(state).digest("hex");
const allowedRedirects = () => (process.env.ALLOWED_EXTENSION_REDIRECT_URIS || "")
    .split(",").map(value => value.trim()).filter(Boolean);

export const validateExtensionRedirect = (redirectUri, allowlist) =>
{
    try
    {
        const url = new URL(redirectUri);
        if (typeof redirectUri !== "string" || !allowlist.includes(redirectUri) || url.protocol !== "https:" ||
            url.username || url.password || url.search || url.hash || url.port ||
            !/^[a-z0-9-]+\.chromiumapp\.org$/.test(url.hostname))
        {
            throw new Error();
        }
    }
    catch
    {
        throw failure("INVALID_LINK_PARAMETERS");
    }
};

export const notionIdentity = tokens =>
{
    validateNotionTokens(tokens);
    // UUID normalization prevents equivalent case variants from evading uniqueness.
    return `workspace:${tokens.workspace_id.toLowerCase()}:user:${tokens.owner.user.id.toLowerCase()}`;
};

export const encryptNotionPair = (tokens, userId) =>
{
    const access = encryptProviderToken(tokens.access_token, { userId, provider: "notion", tokenType: "access" });
    const refresh = encryptProviderToken(tokens.refresh_token, { userId, provider: "notion", tokenType: "refresh" });
    return { encryptedAccessToken: access.encryptedToken, encryptedRefreshToken: refresh.encryptedToken,
        tokenKeyId: access.keyId, tokenEncryptedAt: new Date() };
};

export const createNotionLinkService = (dependencies = {}) =>
{
    const { UserModel = User, AuthIdentityModel = AuthIdentity, ConnectedAccountModel = ConnectedAccount,
        StateModel = NotionLinkState, getConfig = getNotionLinkConfig, getAuthUrl = getNotionLinkAuthUrl,
        exchangeCode = exchangeNotionLinkCode, getAllowedRedirects = allowedRedirects } = dependencies;

    const requireGoogleIdentity = async userId =>
    {
        if (!await AuthIdentityModel.exists({ userId, provider: "google" }))
        {
            throw failure("GOOGLE_IDENTITY_REQUIRED");
        }
    };

    const startLink = async ({ userId, redirectUri, clientNonce }) =>
    {
        await requireGoogleIdentity(userId);
        validateExtensionRedirect(redirectUri, getAllowedRedirects());
        if (typeof clientNonce !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(clientNonce))
        {
            throw failure("INVALID_LINK_PARAMETERS");
        }
        assertTokenEncryptionConfigured();
        const config = getConfig();
        const state = randomBytes(32).toString("base64url");
        const authorizationUrl = getAuthUrl(state, config.redirectUri);
        await StateModel.create({ stateHash: hashState(state), userId, extensionRedirectUri: redirectUri,
            clientNonce, providerRedirectUri: config.redirectUri, expiresAt: new Date(Date.now() + 600000) });
        return { authorizationUrl };
    };

    const completeLink = async ({ state, code, providerError }) =>
    {
        if (typeof state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(state))
        {
            throw failure("INVALID_LINK_STATE");
        }
        const attempt = await StateModel.findOneAndDelete({ stateHash: hashState(state), expiresAt: { $gt: new Date() } });
        if (!attempt)
        {
            throw failure("INVALID_LINK_STATE");
        }
        if (providerError !== undefined || typeof code !== "string" || !code.trim() || code.length > 4096)
        {
            throw failure("NOTION_LINK_CANCELLED");
        }
        validateExtensionRedirect(attempt.extensionRedirectUri, getAllowedRedirects());
        if (!await UserModel.exists({ userId: attempt.userId }))
        {
            throw failure("LINK_USER_NOT_FOUND");
        }
        await requireGoogleIdentity(attempt.userId);
        assertTokenEncryptionConfigured();
        const tokens = await exchangeCode(code, attempt.providerRedirectUri);
        const providerAccountId = notionIdentity(tokens);
        const owner = await ConnectedAccountModel.findOne({ provider: "notion", providerAccountId });
        if (owner && owner.userId !== attempt.userId)
        {
            throw failure("NOTION_ACCOUNT_CONFLICT");
        }
        const values = { ...encryptNotionPair(tokens, attempt.userId), providerAccountId, connected: true,
            notionRefreshLock: null,
            // Replace destination metadata together: never retain a prior workspace's selections.
            metadata: { workspaceId: tokens.workspace_id.toLowerCase(), workspaceName: tokens.workspace_name ?? null,
                workspaceIcon: tokens.workspace_icon ?? null, authorizingUserId: tokens.owner.user.id.toLowerCase(),
                botId: tokens.bot_id.toLowerCase(), reconnectRequired: false } };
        try
        {
            const updated = await ConnectedAccountModel.findOneAndUpdate(
                { userId: attempt.userId, provider: "notion" },
                { $set: values, $setOnInsert: { userId: attempt.userId, provider: "notion" } },
                { upsert: true, new: true, runValidators: true });
            if (!updated)
            {
                throw failure("NOTION_ACCOUNT_CONFLICT");
            }
        }
        catch (error)
        {
            if (error?.code === 11000)
            {
                throw failure("NOTION_ACCOUNT_CONFLICT");
            }
            throw error;
        }
        const redirect = new URL(attempt.extensionRedirectUri);
        redirect.search = new URLSearchParams({ notion_link: "connected", client_nonce: attempt.clientNonce }).toString();
        return { redirectUrl: redirect.toString() };
    };

    const getStatus = async ({ userId }) =>
    {
        await requireGoogleIdentity(userId);
        const account = await ConnectedAccountModel.findOne({ userId, provider: "notion" });
        return { connected: Boolean(account?.connected), reconnectRequired: Boolean(account?.metadata?.reconnectRequired),
            workspaceName: account?.metadata?.workspaceName ?? null, workspaceIcon: account?.metadata?.workspaceIcon ?? null };
    };

    return { startLink, completeLink, getStatus };
};

export default createNotionLinkService();
