import express from "express";
import rateLimit from "express-rate-limit";
import requireAuth from "../middleware/requireAuth.js";
import { asyncHandler } from "../middleware/errorMiddleware.js";
import assets from "../services/imageAssetService.js";
import { imageLimits } from "../services/imageConfig.js";

const router = express.Router();
router.use(requireAuth);
router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 240, keyGenerator: req => req.user.userId,
    standardHeaders: true, legacyHeaders: false, message: { status: "error", message: "Too many image requests. Try again later." } }));
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60,
    keyGenerator: req => req.user.userId, standardHeaders: true, legacyHeaders: false,
    message: { status: "error", message: "Image upload limit reached. Try again later." } });
const operation = (status, action) => asyncHandler(async (req, res) =>
{
    res.set("Cache-Control", "no-store");
    try
    {
        const data = await action(req);
        res.status(status).json({ status: "success", data });
    }
    catch (error)
    {
        const code = [400, 404, 409, 410, 429].includes(error.statusCode) ? error.statusCode : 503;
        res.status(code).json({ status: "error", message: code === 503 ? "Image storage is unavailable. Try again later." : error.message });
    }
});
router.get("/config", operation(200, async () => imageLimits));
router.get("/usage", operation(200, req => assets.usage(req.user.userId)));
router.post("/uploads", uploadLimiter, operation(201, req => assets.initiate(req.user.userId, req.body)));
router.post("/:imageId/complete", operation(200, req => assets.complete(req.user.userId, req.params.imageId)));
router.get("/content/:contentId", operation(200, req => assets.list(req.user.userId, req.params.contentId)));
router.delete("/:imageId", operation(200, async req =>
{
    await assets.remove(req.user.userId, req.params.imageId);
    return { deleted: true };
}));
export default router;
