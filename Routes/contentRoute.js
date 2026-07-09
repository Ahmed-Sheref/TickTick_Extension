import express from 'express';
import * as contentControl from '../Controllers/contentControl.js';
import { asyncHandler } from '../middleware/errorMiddleware.js';
import requireAuth from '../middleware/requireAuth.js';
import { getTickTickProjects } from '../utils/ticktick.js';
import User from "../Models/User.js";

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


router.get("/tags", requireAuth, asyncHandler(contentControl.getUserTags));

router.get("/user/:userId", asyncHandler(contentControl.getContentByUserId));

export default router;