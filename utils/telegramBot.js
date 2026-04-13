import TelegramBot from 'node-telegram-bot-api';
import Settings from '../Models/User.js';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

export const startTelegramBot = async () =>
{
    try
    {
        console.log('[TELEGRAM] Starting Telegram bot...');
        
        // Set Webhook
        const webhookUrl = `${process.env.WEBHOOK_URL}/api/v1/telegram/webhook`;
        await bot.setWebHook(webhookUrl);
        console.log('[TELEGRAM] Webhook set:', webhookUrl);

        // /start command - handle deep link and manual commands
        bot.onText(/\/start (.+)/, async (msg, match) =>
        {
            const chatId = msg.chat.id;
            const userId = match[1].trim();
            
            console.log('[TELEGRAM] === START COMMAND ===');
            console.log('[TELEGRAM] User ID received:', userId);
            console.log('[TELEGRAM] Chat ID:', chatId);

            try
            {
                const user = await Settings.findOne({ userId });

                if (!user)
                {
                    console.log('[TELEGRAM] User not found:', userId);
                    await bot.sendMessage(chatId,
                        ` Invalid User ID: ${userId}\n\n` +
                        `Please open the extension and copy your correct User ID.\n\n` +
                        `Your User ID should look like: USER_1234567890\n\n` +
                        `Get your User ID from extension settings.`
                    );
                    return;
                }

                console.log('[TELEGRAM] User found, updating connection...');
                
                // Update user with Telegram connection
                user.telegramChatId = chatId.toString();
                user.receiveTelegramQuiz = true;
                user.telegramConnected = true;

                await user.save();

                console.log('[TELEGRAM] Connection saved successfully');
                console.log('[TELEGRAM] User ID:', userId);
                console.log('[TELEGRAM] Chat ID:', chatId);
                console.log('[TELEGRAM] Connected:', user.telegramConnected);
                console.log('[TELEGRAM] Quiz enabled:', user.receiveTelegramQuiz);
                
                await bot.sendMessage(chatId,
                    ` Successfully connected!\n\n` +
                    ` Your TickTick extension is now linked to Telegram.\n` +
                    ` You'll receive weekly quizzes every Sunday.\n` +
                    ` You can interact with your saved articles here.\n\n` +
                    `User ID: ${userId}\n\n` +
                    `Good luck! `
                );

                console.log(`[TELEGRAM] User ${userId} connected with chatId ${chatId}`);
                console.log('[TELEGRAM] === CONNECTION COMPLETE ===');
            }
            catch (error)
            {
                console.error('[TELEGRAM] Error:', error.message);
                await bot.sendMessage(chatId,
                    " Something went wrong. Please try again later."
                );
            }
        });

        // /start without userId
        bot.onText(/\/start$/, async (msg) =>
        {
            console.log('[TELEGRAM] Message received without userId');
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
            console.log('[TELEGRAM] Debug message:', msg.text, 'from chat:', msg.chat.id);
        });

        console.log('[TELEGRAM] Bot started successfully');
    }
    catch (error)
    {
        console.error('[TELEGRAM] Failed to start bot:', error.message);
    }
};

export default bot;