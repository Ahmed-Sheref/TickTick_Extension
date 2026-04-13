import express from 'express';
import * as contentControl from '../Controllers/contentControl.js';
import { asyncHandler } from '../middleware/errorMiddleware.js';

const router = express.Router();

router.route("/")
    // .get(asyncHandler(contentControl.getAllContents))
    .post(asyncHandler(contentControl.createContent));

router.get("/user/:userId", asyncHandler(contentControl.getContentByUserId));

export default router;