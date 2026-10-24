import express from "express";
import requireAuth from "../middleware/requireAuth.js";
import notionLinkService from "../services/notionLinkService.js";

const errors = {
    INVALID_LINK_PARAMETERS: [400, "Invalid or unauthorized linking parameters"],
    INVALID_LINK_STATE: [400, "Invalid, expired, or already used linking state"],
    NOTION_LINK_CANCELLED: [400, "Notion authorization was not completed; start again"],
    GOOGLE_IDENTITY_REQUIRED: [403, "A Google-backed application account is required"],
    LINK_USER_NOT_FOUND: [401, "Application user no longer exists"],
    NOTION_ACCOUNT_CONFLICT: [409, "Notion identity conflict; no connection was replaced"],
    NOTION_OAUTH_FAILED: [502, "Notion authorization code exchange failed"],
    NOTION_LINK_UNAVAILABLE: [503, "Notion linking is not configured correctly"],
    TOKEN_ENCRYPTION_UNAVAILABLE: [503, "Provider token encryption is not configured correctly"]
};

export const createNotionLinkRouter = ({ service = notionLinkService, authenticate = requireAuth } = {}) =>
{
    const router = express.Router();
    router.use((req, res, next) =>
    {
        res.set("Cache-Control", "no-store");
        res.set("Pragma", "no-cache");
        res.set("Referrer-Policy", "no-referrer");
        next();
    });
    const respondError = (res, error) =>
    {
        const [status, message] = Object.hasOwn(errors, error?.code)
            ? errors[error.code] : [500, "Notion linking failed"];
        return res.status(status).json({ status: "error", message });
    };
    router.post("/link", authenticate, async (req, res) =>
    {
        try
        {
            const data = await service.startLink({ userId: req.user.userId,
                redirectUri: req.body?.redirect_uri, clientNonce: req.body?.client_nonce });
            return res.status(200).json({ status: "success", data });
        }
        catch (error)
        {
            return respondError(res, error);
        }
    });
    router.get("/callback", async (req, res) =>
    {
        try
        {
            const result = await service.completeLink({ state: req.query.state,code: req.query.code, providerError: req.query.error });
            return res.redirect(result.redirectUrl);
        }
        catch (error)
        {
            return respondError(res, error);
        }
    });
    router.get("/status", authenticate, async (req, res) =>
    {
        try
        {
            return res.json({ status: "success", data: await service.getStatus({ userId: req.user.userId }) });
        }
        catch (error)
        {
            return respondError(res, error);
        }
    });
    return router;
};

export default createNotionLinkRouter();
