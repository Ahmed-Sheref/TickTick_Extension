import express from 'express';
import * as contentControl from '../Controllers/contentControl.js';
import { asyncHandler } from '../middleware/errorMiddleware.js';
import requireAuth from '../middleware/requireAuth.js';
import { getTickTickProjects } from '../utils/ticktick.js';
import User from "../Models/User.js";

import{createTickTickProject} from "../utils/ticktick.js";

const router = express.Router();

router.route("/")
    .post(asyncHandler(contentControl.createContent));
    // .get(asyncHandler(contentControl.getAllContents))

router.get("/projects", requireAuth, async (req, res) =>
{
    const user = await User.findOne({ userId: req.user.userId });
    const projects = await getTickTickProjects(user.tickTickAccessToken);

    res.json({ status: "success", data: projects });
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

            const user = await User.findOne({userId: req.user.userId});

            if (!user?.tickTickConnected ||!user?.tickTickAccessToken)
            {
                return res.status(401).json(
                {
                    status: "error",
                    message:"TickTick account is not connected"
                });
            }

            const project = await createTickTickProject(user.tickTickAccessToken,projectName);

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