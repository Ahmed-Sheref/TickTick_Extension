import User from "../Models/User.js";
import ConnectedAccount from "../Models/ConnectedAccount.js";
import { decryptProviderToken } from "../utils/providerTokenEncryption.js";

// New encrypted links take precedence. Legacy credentials remain readable;
// this resolver never copies, rotates, deletes, or writes provider tokens.
export const getTickTickAccessToken = async (userId, legacyUser) =>
{
    const account = await ConnectedAccount.findOne({ userId, provider: "ticktick" })
        .select("+encryptedAccessToken");
    // Phase-1 placeholder rows had no credentials and were ignored by legacy
    // readers. Preserve that behavior; only an active/encrypted row takes over.
    if (account && (account.connected || account.encryptedAccessToken))
    {
        if (!account.connected)
        {
            return null;
        }
        if (account.encryptedAccessToken?.split(".")[1] !== account.tokenKeyId)
        {
            const error = new Error("Provider token could not be decrypted");
            error.statusCode = 503;
            throw error;
        }
        return decryptProviderToken(account.encryptedAccessToken,
            { userId, provider: "ticktick", tokenType: "access" });
    }
    const user = legacyUser === undefined ? await User.findOne({ userId }) : legacyUser;
    return user?.tickTickConnected && user?.tickTickAccessToken ? user.tickTickAccessToken : null;
};
