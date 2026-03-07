import express from 'express';
import * as contentControl from '../Controllers/contentControl.js';

const router = express.Router();

router.route("/")
    .get(contentControl.getAllContents)
    .post(contentControl.createContent);

export default router;