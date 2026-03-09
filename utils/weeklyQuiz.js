import cron from 'node-cron';
import Settings from '../Models/User.js';
import Content from '../Models/Content.js';
import bot from './telegramBot.js';

const quizPollMap = new Map();

export const startWeeklyQuizCron = () =>
{
    cron.schedule('*/30 * * * * *', async () =>
    {
        console.log('🧠 Starting weekly quiz job...');

        try
        {
            const users = await Settings.find(
            {
                telegramQuiz: true,
                telegramChatId: { $exists: true, $ne: null }
            });

            console.log(`Found ${users.length} users to send quiz`);

            for (const user of users)
            {
                try
                {
                    const contents = await Content.find(
                    {
                        userId: user.userId,
                        'quiz.question': { $exists: true },
                        'quiz.isSolved': false
                    }).limit(3);

                    if (contents.length === 0)
                    {
                        console.log(`No unsolved quizzes for ${user.userId}`);
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
                        const poll = await bot.sendPoll(
                            user.telegramChatId,
                            content.quiz.question,
                            content.quiz.options,
                            {
                                type: 'quiz',
                                correct_option_id: content.quiz.options.indexOf(content.quiz.correctAnswer),
                                is_anonymous: false,
                                explanation: `From article: ${content.title}`
                            }
                        );

                        quizPollMap.set(poll.poll.id, content._id.toString());
                        console.log(`✅ Quiz sent for: ${content.title}`);
                    }
                }
                catch (userError)
                {
                    console.error(`Failed for ${user.userId}:`, userError.message);
                }
            }

            console.log('✅ Weekly quiz job done!');
        }
        catch (error)
        {
            console.error('Weekly quiz job failed:', error.message);
        }
    });

    bot.on('poll_answer', async (answer) =>
    {
        try
        {

            console.log('poll_answer received:', answer);
            const contentId = quizPollMap.get(answer.poll_id);
            console.log('mapped contentId:', contentId);
            if (!contentId) return;

            await Content.findByIdAndUpdate(contentId,
            {
                'quiz.isSolved': true
            });

            console.log(`✅ Quiz solved for content: ${contentId}`);
        }
        catch (error)
        {
            console.error('Poll answer error:', error.message);
        }
    });

    console.log('⏰ Weekly quiz cron started');
};