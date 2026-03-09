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

router.post('/webhook', (req, res) =>
{
    try
    {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    }
    catch (error)
    {
        console.error('Webhook error:', error.message);
        res.sendStatus(500);
    }
});

export default router;