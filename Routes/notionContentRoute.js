import express from "express";
import requireAuth from "../middleware/requireAuth.js";
import notionDestinationService from "../services/notionDestinationService.js";
import notionContentService from "../services/notionContentService.js";
import
{
    notionFailure,
    safeNotionFailure
}
from "../utils/notionErrors.js";

export const createNotionContentRouter = (
{
    destinations = notionDestinationService,
    contents = notionContentService,
    authenticate = requireAuth
} = {}) =>
{
    const router = express.Router();
    router.use((req, res, next) =>
    {
        res.set("Cache-Control", "no-store");
        res.set("Pragma", "no-cache");
        res.set("Referrer-Policy", "no-referrer");
        next();
    });
    router.use(authenticate);
    const handle = action => async (req, res) =>
    {
        try
        {
            return res.json(
            {
                status: "success",
                data: await action(req)
            });
        }
        catch (error)
        {
            const safe = safeNotionFailure(error);
            if (safe.retryAfter !== undefined) res.set("Retry-After", String(safe.retryAfter));
            return res.status(safe.statusCode).json(
            {
                status: "error",
                code: safe.code,
                message: safe.message
            });
        }
    };
    const requireEmptyBody = req =>
    {
        if (req.body != null && (typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length))
            throw notionFailure("INVALID_NOTION_INPUT");
    };
    router.get("/destinations", handle(req => destinations.discover(
    {
        userId: req.user.userId,
        query: req.query
    })));
    router.get("/destination", handle(req => destinations.getSelection(
    {
        userId: req.user.userId
    })));
    router.put("/destination", handle(req => destinations.select(
    {
        userId: req.user.userId,
        body: req.body
    })));
    router.delete("/destination", handle(req =>
    {
        requireEmptyBody(req);
        return destinations.clear(
        {
            userId: req.user.userId
        });
    }));
    router.post("/sync/:contentId", handle(req =>
    {
        requireEmptyBody(req);
        return contents.syncContent(
        {
            userId: req.user.userId,
            contentId: req.params.contentId
        });
    }));
    return router;
};

export default createNotionContentRouter();
