import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import Settings from '../Models/User.js';

dotenv.config({path: 'D:\\Programming\\Back_end\\TickTick_EXTENSION\\config.env'});

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

export const startTelegramBot = async () =>
{
    try
    {
        // Set Webhook
        const webhookUrl = `${process.env.WEBHOOK_URL}/api/v1/telegram/webhook`;
        await bot.setWebHook(webhookUrl);
        console.log('Telegram Webhook set:', webhookUrl);

        // /start command
        bot.onText(/\/start (.+)/, async (msg, match) =>
        {
            const chatId = msg.chat.id;
            const userId = match[1];

            try
            {
                await Settings.findOneAndUpdate(
                    { userId },
                    {
                        telegramChatId: chatId.toString(),
                        telegramQuiz: true
                    },
                    { upsert: true, new: true }
                );

                await bot.sendMessage(chatId,
                    `✅ Connected successfully!\n\n` +
                    `You will receive weekly quizzes every Sunday.\n` +
                    `Good luck!`
                );

                console.log(`User ${userId} connected with chatId ${chatId}`);
            }
            catch (error)
            {
                console.error('Error saving user:', error.message);
                await bot.sendMessage(chatId, '❌ Something went wrong. Please try again.');
            }
        });

        // /start without userId
        bot.onText(/\/start$/, async (msg) =>
        {
            const chatId = msg.chat.id;
            await bot.sendMessage(chatId,
                `⚠️ Please start with your User ID:\n\n` +
                `/start YOUR_USER_ID\n\n` +
                `Example: /start USER_123`
            );
        });

    }
    catch (error)
    {
        throw new Error(`Failed to start Telegram bot: ${error.message}`);
    }
};

export default bot;