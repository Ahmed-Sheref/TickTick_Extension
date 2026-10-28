import express from 'express';
import * as contentControl from '../Controllers/contentControl.js';
import
{
    asyncHandler
}
from '../middleware/errorMiddleware.js';
import requireAuth from '../middleware/requireAuth.js';
import contentSyncStatusService from "../services/contentSyncStatusService.js";
import ticktickContentService from "../services/ticktickContentService.js";
import
{
    getTickTickProjects
}
from '../utils/ticktick.js';
import User from "../Models/User.js";
import
{
    getTickTickAccessToken
}
from "../services/ticktickCredentials.js";

import
{
    createTickTickProject
}
from "../utils/ticktick.js";

const router = express.Router();

router.get("/:contentId/sync-status", requireAuth, asyncHandler(async (req, res) =>
{
    res.set("Cache-Control", "no-store");
    try
    {
        const data = await contentSyncStatusService.getStatus(
        {
            userId: req.user.userId,
            contentId: req.params.contentId
        });
        return res.json(
        {
            status: "success",
            data
        });
    }
    catch (error)
    {
        const status = [400, 404].includes(error.statusCode) ? error.statusCode : 503;
        return res.status(status).json(
        {
            status: "error",
            message: status === 503 ? "Synchronization status is unavailable" : error.message
        });
    }
}));

router.post("/:contentId/sync/ticktick", requireAuth, asyncHandler(async (req, res) =>
{
    res.set("Cache-Control", "no-store");
    if (req.body != null && (typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length))
        return res.status(400).json(
        {
            status: "error",
            message: "This endpoint accepts no provider options"
        });
    try
    {
        const data = await ticktickContentService.syncContent(
        {
            userId: req.user.userId,
            contentId: req.params.contentId
        });
        return res.json(
        {
            status: "success",
            data
        });
    }
    catch (error)
    {
        const known = /^(TICKTICK_|CONTENT_NOT_FOUND)/.test(error?.code || "");
        return res.status(known ? error.statusCode : 503).json(
        {
            status: "error",
            code: known ? error.code : "TICKTICK_SYNC_FAILED",
            message: known ? error.message : "TickTick synchronization could not be confirmed"
        });
    }
}));

router.route("/")
    .post(asyncHandler(contentControl.createContent));
// .get(asyncHandler(contentControl.getAllContents))

router.get("/projects", requireAuth, async (req, res) =>
{
    const user = await User.findOne(
    {
        userId: req.user.userId
    });
    const accessToken = await getTickTickAccessToken(req.user.userId, user);
    if (!accessToken)
    {
        return res.status(401).json(
        {
            status: "error",
            message: "TickTick account is not connected"
        });
    }
    const projects = await getTickTickProjects(accessToken);

    res.json(
    {
        status: "success",
        data: projects
    });
});

router.post(
    "/projects",
    requireAuth,
    async (req, res, next) =>
    {
        try
        {
            const projectName = req.body.name?.trim();

            if (!projectName)
            {
                return res.status(400).json(
                {
                    status: "error",
                    message: "Project name is required"
                });
            }

            const user = await User.findOne(
            {
                userId: req.user.userId
            });

            const accessToken = await getTickTickAccessToken(req.user.userId, user);
            if (!accessToken)
            {
                return res.status(401).json(
                {
                    status: "error",
                    message: "TickTick account is not connected"
                });
            }

            const project = await createTickTickProject(accessToken, projectName);

            return res.status(201).json(
            {
                status: "success",
                data: project
            });
        }
        catch (error)
        {
            next(error);
        }
    }
);

router.get("/tags", requireAuth, asyncHandler(contentControl.getUserTags));

router.get("/user/:userId", asyncHandler(contentControl.getContentByUserId));

export default router;
