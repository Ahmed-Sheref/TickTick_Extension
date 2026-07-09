import User from "../Models/User.js";
import Content from "../Models/Content.js";
import QuizPoll from "../Models/QuizPoll.js";
import bot from "../utils/telegramBot.js";

const getUsersForWeeklyQuiz = async () =>
{
    return User.find(
    {
        receiveTelegramQuiz: true,
        telegramChatId: { $exists: true, $ne: null }
    });
};

const getUnsolvedQuizContents = async (userId) =>
{
    return Content.find(
    {
        userId,
        "quiz.question": { $exists: true },
        "quiz.isSolved": false,
        "options.includeInTelegramQuiz": true
    })
    .sort({ createdAt: -1 })
    .limit(3);
};

const isValidQuiz = (content) =>
{
    if (!content.quiz?.options || content.quiz.options.length < 2)
    {
        return false;
    }

    const correctOptionIndex = content.quiz.options.indexOf(content.quiz.correctAnswer);

    return correctOptionIndex !== -1;
};

const getCorrectOptionIndex = (content) =>
{
    return content.quiz.options.indexOf(content.quiz.correctAnswer);
};

const sendNoQuizzesMessage = async (user) =>
{
    await bot.sendMessage(
        user.telegramChatId,
        "🎉 You solved all your quizzes this week! Save more articles to get new ones."
    );
};

const sendQuizIntroMessage = async (user, quizCount) =>
{
    await bot.sendMessage(
        user.telegramChatId,
        `🧠 *Weekly Quiz Time!*\nYou have ${quizCount} question(s) to answer:`,
        { parse_mode: "Markdown" }
    );
};

const createQuizPollRecord = async ({ poll, content, user }) =>
{
    await QuizPoll.create(
    {
        pollId: poll.poll.id,
        contentId: content._id,
        userId: user.userId,
        chatId: user.telegramChatId,
        isAnswered: false,
        sentAt: new Date()
    });
};

const sendQuizPoll = async ({ user, content }) =>
{
    if (!isValidQuiz(content))
    {
        console.log(`[QUIZ] Invalid quiz for content: ${content._id}`);
        return;
    }

    const correctOptionIndex = getCorrectOptionIndex(content);

    const poll = await bot.sendPoll(
        user.telegramChatId,
        content.quiz.question,
        content.quiz.options,
        {
            type: "quiz",
            correct_option_id: correctOptionIndex,
            is_anonymous: false,
            explanation: `From article: ${content.title}`
        }
    );

    await createQuizPollRecord(
    {
        poll,
        content,
        user
    });

    console.log(`[QUIZ] Quiz sent for: ${content.title}`);
};

const sendQuizzesToUser = async (user) =>
{
    const contents = await getUnsolvedQuizContents(user.userId);

    if (contents.length === 0)
    {
        console.log(`[QUIZ] No unsolved quizzes for ${user.userId}`);
        await sendNoQuizzesMessage(user);
        return;
    }

    await sendQuizIntroMessage(user, contents.length);

    for (const content of contents)
    {
        await sendQuizPoll(
        {
            user,
            content
        });
    }
};

const sendWeeklyQuizzes = async () =>
{
    console.log("[QUIZ] Starting weekly quiz job...");

    const users = await getUsersForWeeklyQuiz();

    console.log(`[QUIZ] Found ${users.length} users to send quiz`);

    for (const user of users)
    {
        try
        {
            await sendQuizzesToUser(user);
        }
        catch (userError)
        {
            console.error(`[QUIZ] Failed for ${user.userId}:`, userError.message);
        }
    }

    console.log("[QUIZ] Weekly quiz job completed");
};

const handlePollAnswer = async (answer) =>
{
    console.log("[QUIZ] Poll answer received for poll:", answer.poll_id);

    const quizPoll = await QuizPoll.findOne({ pollId: answer.poll_id });

    if (!quizPoll)
    {
        console.log("[QUIZ] No poll found for ID:", answer.poll_id);
        return;
    }

    if (quizPoll.isAnswered)
    {
        console.log("[QUIZ] Poll already answered:", answer.poll_id);
        return;
    }

    await Promise.all(
    [
        QuizPoll.findByIdAndUpdate(
            quizPoll._id,
            {
                isAnswered: true,
                answeredAt: new Date()
            }
        ),
        Content.findByIdAndUpdate(
            quizPoll.contentId,
            {
                "quiz.isSolved": true
            }
        )
    ]);

    console.log(`[QUIZ] Quiz solved for content: ${quizPoll.contentId}`);
};

export default 
{
    sendWeeklyQuizzes,
    handlePollAnswer
};