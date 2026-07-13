import express from 'express';
import bot from '../utils/telegramBot.js';

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
        console.log("[TELEGRAM] Webhook reached:",req.body?.update_id,req.body?.message?.text);

        try
        {
            await bot.processUpdate(req.body);
            return res.sendStatus(200);
        }
        catch (error)
        {
            console.error(
                "[TELEGRAM] Webhook error:",
                error
            );

            return res.sendStatus(500);
        }
    }
);

export default router;