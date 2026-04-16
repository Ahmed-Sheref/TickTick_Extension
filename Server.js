import 'dotenv/config';
import mongoose from 'mongoose';
import app from './index.js';
import { startWeeklyEmailCron } from './utils/weeklyEmail.js';
import { startTelegramBot } from './utils/telegramBot.js';
import { startWeeklyQuizCron } from './utils/weeklyQuiz.js';

// Load environment variables centrally
// dotenv.config();

// dotenv.config({path: 'D:\\Programming\\Back_end\\ticktick_extension\\config.env'})

const DB = process.env.DATABASE;

console.log('[DB] DATABASE env variable:', DB ? 'Found' : 'NOT FOUND');
console.log('[DB] DB value:', DB || 'undefined');

const PORT = process.env.PORT || 3000;
mongoose.connect(DB)
.then((con) =>
{
    console.log('[DB] MongoDB connection successful');
    // startTelegramBot();
    // startWeeklyEmailCron();
    // startWeeklyQuizCron();
    app.listen(PORT, '0.0.0.0',() =>
    {
        console.log(`[SERVER] Server is running on port ${PORT}`);
    });
})
.catch((err) => 
{
    console.error('[DB] Connection Error:', err);
    process.exit(1);
});