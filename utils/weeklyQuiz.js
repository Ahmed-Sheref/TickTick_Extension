import cron from "node-cron";
import bot from "./telegramBot.js";
import weeklyQuizService from "../services/weeklyQuizService.js";

export const startWeeklyQuizCron = () =>
{
    cron.schedule("0 0 * * 0", async () =>
    {
        try
        {
            await weeklyQuizService.sendWeeklyQuizzes();
        }
        catch (error)
        {
            console.error("[QUIZ] Weekly quiz job failed:", error.message);
        }
    });

    console.log("[QUIZ] Weekly quiz cron started");
};

bot.on("poll_answer", async (answer) =>
{
    try
    {
        await weeklyQuizService.handlePollAnswer(answer);
    }
    catch (error)
    {
        console.error("[QUIZ] Poll answer error:", error.message);
    }
});