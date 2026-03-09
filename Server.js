import dotenv from 'dotenv';
import mongoose from 'mongoose';
import app from './index.js';
import { startWeeklyEmailCron } from './utils/weeklyEmail.js';
import { startTelegramBot } from './utils/telegramBot.js';
import { startWeeklyQuizCron } from './utils/weeklyQuiz.js';

dotenv.config({path: 'D:\\Programming\\Back_end\\ticktick_extension\\config.env'})

const DB = process.env.DATABASE;

console.log('DATABASE env variable:', DB ? 'Found' : 'NOT FOUND');
console.log('DB value:', DB || 'undefined');

mongoose.connect(DB)
.then((con) =>
{
    console.log('Connection Done');
    startTelegramBot();
    startWeeklyEmailCron();
    startWeeklyQuizCron();
    app.listen(3000, () =>
    {
        console.log('Server is running on port 3000');
    });
})
.catch((err) =>
{
    console.error('Connection Error:', err);
    console.log('Starting server without database connection...');
    app.listen(3000, () =>
    {
        console.log('Server is running on port 3000 (without database)');
    });
});