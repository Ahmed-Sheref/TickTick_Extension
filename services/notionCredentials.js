import { randomBytes } from "node:crypto";
import User from "../Models/User.js";
import AuthIdentity from "../Models/AuthIdentity.js";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import { assertTokenEncryptionConfigured, decryptProviderToken } from "../utils/providerTokenEncryption.js";
import { getNotionLinkConfig, refreshNotionTokens, validateNotionTokens } from "../utils/notionLinkOAuth.js";
import { encryptNotionPair, notionIdentity } from "./notionLinkService.js";
import { notionFailure } from "../utils/notionErrors.js";
import { notionId } from "../validators/notionValidator.js";

const failure = code => Object.assign(new Error(code), { code });

// Internal server API only. The caller supplies the authenticated owning userId
// from req.user, or a trusted job's owner context, never a client account ID.
export const createNotionCredentialService = (dependencies = {}) =>
{
    const { UserModel = User, AuthIdentityModel = AuthIdentity, ConnectedAccountModel = ConnectedAccount,
        refreshTokens = refreshNotionTokens, getConfig = getNotionLinkConfig } = dependencies;

    const refreshForUser = async ({ userId }) =>
    {
        if (typeof userId !== "string" || !userId || !await UserModel.exists({ userId }) ||
            !await AuthIdentityModel.exists({ userId, provider: "google" }))
        {
            throw failure("GOOGLE_IDENTITY_REQUIRED");
        }
        assertTokenEncryptionConfigured();
        getConfig();
        const lock = randomBytes(32).toString("hex");
        // Atomic database claim serializes refreshes across processes. Existing
        // rows with no field match null. Reconnect clears the claim in its write.
        const account = await ConnectedAccountModel.findOneAndUpdate(
            { userId, provider: "notion", connected: true, notionRefreshLock: null },
            { $set: { notionRefreshLock: lock } }, { new: true, runValidators: true })
            .select("+encryptedRefreshToken +notionRefreshLock");
        if (!account)
        {
            throw failure("NOTION_REFRESH_UNAVAILABLE");
        }
        const ownership = { userId, provider: "notion", notionRefreshLock: lock };
        try
        {
            const token = decryptProviderToken(account.encryptedRefreshToken,
                { userId, provider: "notion", tokenType: "refresh" });
            const tokens = await refreshTokens(token);
            validateNotionTokens(tokens, { identityRequired: false });
            // Refresh must never silently switch destinations. Some responses
            // omit identity; retain the identity verified at initial linking.
            if ((tokens.workspace_id !== undefined || tokens.owner !== undefined || tokens.bot_id !== undefined) &&
                notionIdentity(tokens) !== account.providerAccountId)
            {
                throw failure("NOTION_RECONNECT_REQUIRED");
            }
            const values = { ...encryptNotionPair(tokens, userId), connected: true, notionRefreshLock: null,
                "metadata.reconnectRequired": false };
            if (tokens.bot_id !== undefined)
            {
                values["metadata.botId"] = tokens.bot_id.toLowerCase();
            }
            for (const [source, target] of [["workspace_name", "workspaceName"], ["workspace_icon", "workspaceIcon"]])
            {
                if (tokens[source] !== undefined)
                {
                    values[`metadata.${target}`] = tokens[source];
                }
            }
            const updated = await ConnectedAccountModel.findOneAndUpdate(ownership,
                { $set: values }, { new: true, runValidators: true });
            if (!updated)
            {
                // A newer reconnect superseded this operation. Never overwrite it.
                throw failure("NOTION_REFRESH_SUPERSEDED");
            }
            return { connected: true };
        }
        catch (error)
        {
            if (error?.code === "NOTION_REFRESH_SUPERSEDED")
            {
                throw error;
            }
            try
            {
                // Keep the claim on uncertain outcomes. It cannot be reused by
                // another refresh; a successful authorization is the recovery.
                await ConnectedAccountModel.findOneAndUpdate(ownership,
                    { $set: { connected: false, "metadata.reconnectRequired": true } }, { runValidators: true });
            }
            catch
            {
                // If MongoDB is unavailable the durable claim still blocks reuse.
            }
            throw failure("NOTION_RECONNECT_REQUIRED");
        }
    };
    // Internal only: never serialize this snapshot into an HTTP response. The
    // access ciphertext is a CAS version for destination writes, not a new token.
    const getForUser = async ({ userId, expectedConnection } = {}) =>
    {
        if (typeof userId !== "string" || !userId || !await UserModel.exists({ userId }) ||
            !await AuthIdentityModel.exists({ userId, provider: "google" }))
            throw notionFailure("GOOGLE_IDENTITY_REQUIRED");
        const account = await ConnectedAccountModel.findOne({ userId, provider: "notion" })
            .select("userId provider connected providerAccountId metadata +encryptedAccessToken +notionRefreshLock");
        if (account?.metadata?.reconnectRequired) throw notionFailure("NOTION_RECONNECT_REQUIRED");
        if (!account?.connected || account.userId !== userId || account.provider !== "notion")
            throw notionFailure("NOTION_NOT_CONNECTED");
        if (account.notionRefreshLock) throw notionFailure("NOTION_REFRESH_UNAVAILABLE");
        const workspaceId = notionId(account.metadata?.workspaceId);
        const authorizingUserId = notionId(account.metadata?.authorizingUserId);
        if (!workspaceId || !authorizingUserId || !notionId(account.metadata?.botId) ||
            account.providerAccountId !== `workspace:${workspaceId}:user:${authorizingUserId}`)
            throw notionFailure("NOTION_RECONNECT_REQUIRED");
        const connection = { accountId: String(account._id), providerAccountId: account.providerAccountId, workspaceId,
            credentialVersion: account.encryptedAccessToken, destination: account.metadata?.notionDestination ?? null };
        if (expectedConnection && (connection.accountId !== expectedConnection.accountId ||
            connection.providerAccountId !== expectedConnection.providerAccountId || connection.workspaceId !== expectedConnection.workspaceId ||
            (expectedConnection.selectionId && connection.destination?.selectionId !== expectedConnection.selectionId)))
            throw notionFailure("NOTION_CONNECTION_CHANGED");
        getConfig();
        assertTokenEncryptionConfigured();
        let accessToken;
        try {
            accessToken = decryptProviderToken(account.encryptedAccessToken, { userId, provider: "notion", tokenType: "access" });
        } catch (error) {
            if (error?.code === "TOKEN_ENCRYPTION_UNAVAILABLE") throw error;
            throw notionFailure("NOTION_RECONNECT_REQUIRED");
        }
        if (!accessToken?.trim() || accessToken.length > 16384 || /[\r\n]/.test(accessToken))
            throw notionFailure("NOTION_RECONNECT_REQUIRED");
        return { accessToken, connection };
    };

    const markRejectedForUser = async ({ userId, connection }) =>
        ConnectedAccountModel.findOneAndUpdate({ userId, provider: "notion", connected: true,
            encryptedAccessToken: connection.credentialVersion },
        { $set: { connected: false, "metadata.reconnectRequired": true } }, { runValidators: true });

    return { refreshForUser, getForUser, markRejectedForUser };
};

export default createNotionCredentialService();
