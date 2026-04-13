import cron from 'node-cron';
import User from '../Models/User.js';
import Content from '../Models/Content.js';
import QuizPoll from '../Models/QuizPoll.js';
import bot from './telegramBot.js';

export const startWeeklyQuizCron = () =>
{
    cron.schedule('* * * * *', async () =>
    {
        console.log('[QUIZ] Starting weekly quiz job...');

        try
        {
            const users = await User.find(
            {
                receiveTelegramQuiz: true,
                telegramChatId: { $exists: true, $ne: null }
            });

            console.log(`[QUIZ] Found ${users.length} users to send quiz`);

            for (const user of users)
            {
                try
                {
                    const contents = await Content.find(
                    {
                        userId: user.userId,
                        'quiz.question': { $exists: true },
                        'quiz.isSolved': false,
                        'options.includeInTelegramQuiz': true
                    })
                    .sort({ createdAt: -1 })
                    .limit(3);

                    if (contents.length === 0)
                    {
                        console.log(`[QUIZ] No unsolved quizzes for ${user.userId}`);
                        await bot.sendMessage(
                            user.telegramChatId,
                            '🎉 You solved all your quizzes this week! Save more articles to get new ones.'
                        );
                        continue;
                    }

                    await bot.sendMessage(
                        user.telegramChatId,
                        `🧠 *Weekly Quiz Time!*\nYou have ${contents.length} question(s) to answer:`,
                        { parse_mode: 'Markdown' }
                    );

                    for (const content of contents)
                    {
                        if (!content.quiz?.options || content.quiz.options.length < 2)
                        {
                            console.log(`[QUIZ] Invalid quiz options for content: ${content._id}`);
                            continue;
                        }

                        const correctOptionIndex = content.quiz.options.indexOf(content.quiz.correctAnswer);

                        if (correctOptionIndex === -1)
                        {
                            console.log(`[QUIZ] Correct answer not found in options for content: ${content._id}`);
                            continue;
                        }

                        const poll = await bot.sendPoll(
                            user.telegramChatId,
                            content.quiz.question,
                            content.quiz.options,
                            {
                                type: 'quiz',
                                correct_option_id: correctOptionIndex,
                                is_anonymous: false,
                                explanation: `From article: ${content.title}`
                            }
                        );

                        // Create QuizPoll document after sending poll
                        await QuizPoll.create({
                            pollId: poll.poll.id,
                            contentId: content._id,
                            userId: user.userId,
                            chatId: user.telegramChatId,
                            isAnswered: false,
                            sentAt: new Date()
                        });
                        
                        console.log(`[QUIZ] Quiz sent for: ${content.title}`);
                    }
                }
                catch (userError)
                {
                    console.error(`[QUIZ] Failed for ${user.userId}:`, userError.message);
                }
            }

            console.log('[QUIZ] Weekly quiz job completed');
        }
        catch (error)
        {
            console.error('[QUIZ] Weekly quiz job failed:', error.message);
        }
    });

    console.log('[QUIZ] Weekly quiz cron started');
};

bot.on('poll_answer', async (answer) =>
{
    try
    {
        console.log('[QUIZ] Poll answer received for poll:', answer.poll_id);

        // Find the QuizPoll document
        const quizPoll = await QuizPoll.findOne({ pollId: answer.poll_id });
        
        if (!quizPoll) {
            console.log('[QUIZ] No poll found for ID:', answer.poll_id);
            return;
        }

        if (quizPoll.isAnswered) {
            console.log('[QUIZ] Poll already answered:', answer.poll_id);
            return;
        }

        // Update both QuizPoll and Content documents
        await Promise.all([
            QuizPoll.findByIdAndUpdate(
                quizPoll._id,
                { 
                    isAnswered: true,
                    answeredAt: new Date()
                }
            ),
            Content.findByIdAndUpdate(
                quizPoll.contentId,
                { 'quiz.isSolved': true }
            )
        ]);

        console.log(`[QUIZ] Quiz solved for content: ${quizPoll.contentId}`);
    }
    catch (error)
    {
        console.error('[QUIZ] Poll answer error:', error.message);
    }
});