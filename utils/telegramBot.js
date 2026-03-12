import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import Settings from '../Models/User.js';

dotenv.config({path: 'D:\\Programming\\Back_end\\TickTick_EXTENSION\\config.env'});

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

export const startTelegramBot = async () =>
{
    try
    {
        console.log(' Starting Telegram bot...');
        
        // Set Webhook
        const webhookUrl = `${process.env.WEBHOOK_URL}/api/v1/telegram/webhook`;
        await bot.setWebHook(webhookUrl);
        console.log(' Telegram Webhook set:', webhookUrl);

        // /start command - handle deep link and manual commands
        bot.onText(/\/start (.+)/, async (msg, match) =>
        {
            const chatId = msg.chat.id;
            const userId = match[1].trim();
            
            console.log(' === TELEGRAM BOT START COMMAND ===');
            console.log(' User ID received:', userId);
            console.log(' Chat ID:', chatId);
            console.log(' Full message:', msg.text);
            console.log(' Message type: Deep link or manual command');

            try
            {
                const user = await Settings.findOne({ userId });

                if (!user)
                {
                    console.log(' User not found in database:', userId);
                    await bot.sendMessage(chatId,
                        ` Invalid User ID: ${userId}\n\n` +
                        `Please open the extension and copy your correct User ID.\n\n` +
                        `Your User ID should look like: USER_1234567890\n\n` +
                        `Get your User ID from extension settings.`
                    );
                    return;
                }

                console.log(' User found in database, updating connection...');
                
                // Update user with Telegram connection
                user.telegramChatId = chatId.toString();
                user.telegramQuiz = true;
                user.telegramConnected = true;

                await user.save();

                console.log(' Telegram connection saved successfully');
                console.log(' User details:');
                console.log('  - User ID:', userId);
                console.log('  - Chat ID:', chatId);
                console.log('  - Telegram Connected:', user.telegramConnected);
                console.log('  - Telegram Quiz:', user.telegramQuiz);
                
                await bot.sendMessage(chatId,
                    ` Successfully connected!\n\n` +
                    ` Your TickTick extension is now linked to Telegram.\n` +
                    ` You'll receive weekly quizzes every Sunday.\n` +
                    ` You can interact with your saved articles here.\n\n` +
                    `User ID: ${userId}\n\n` +
                    `Good luck! `
                );

                console.log(` User ${userId} connected with chatId ${chatId}`);
                console.log('=== TELEGRAM BOT CONNECTION COMPLETE ===');
            }
            catch (error)
            {
                console.error(' Telegram bot error:', error);
                await bot.sendMessage(chatId,
                    " Something went wrong. Please try again later."
                );
            }
        });

        // /start without userId
        bot.onText(/\/start$/, async (msg) =>
        {
            console.log(msg);
            const chatId = msg.chat.id;
            await bot.sendMessage(chatId,
                ` Please start with your User ID:\n\n` +
                `/start YOUR_USER_ID\n\n` +
                `Example: /start USER_123\n\n` +
                `Get your User ID from the extension settings.`
            );
        });

        // Handle any message for debugging
        bot.on('message', (msg) => {
            console.log('📨 Received message:', msg.text);
            console.log('👤 From chat ID:', msg.chat.id);
        });

        console.log(' Telegram bot started successfully and ready to receive commands!');
    }
    catch (error)
    {
        console.error(' Failed to start Telegram bot:', error);
    }
};

export default bot;