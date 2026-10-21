import express from 'express';
import bot from '../utils/telegramBot.js';
import { timingSafeEqual } from 'node:crypto';

const router = express.Router();

// User sends message
// ↓
// Telegram receives message
// ↓
// Telegram sends POST request to webhook
// ↓
// Express route receives it
// ↓
// bot.processUpdate()
// ↓
// bot.onText()
// ↓
// your code runs
// ↓
// bot.sendMessage()
// ↓
// Telegram sends reply to user

router.post(
    "/webhook",
    async (req, res) =>
    {
        const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
        const receivedSecret = req.get("X-Telegram-Bot-Api-Secret-Token");

        if (!expectedSecret)
        {
            console.error("[TELEGRAM] Webhook secret is not configured");
            return res.sendStatus(503);
        }

        if (typeof receivedSecret !== "string")
        {
            return res.sendStatus(403);
        }

        const expectedBuffer = Buffer.from(expectedSecret);
        const receivedBuffer = Buffer.from(receivedSecret);

        if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer))
        {
            return res.sendStatus(403);
        }

        console.log("[TELEGRAM] Webhook reached:", req.body?.update_id, req.body?.message?.text);

        try
        {
            await bot.processUpdate(req.body);
            return res.sendStatus(200);
        }
        catch (error)
        {
            console.error("[TELEGRAM] Webhook error:", error);
            return res.sendStatus(500);
        }
    }
);

export default router;