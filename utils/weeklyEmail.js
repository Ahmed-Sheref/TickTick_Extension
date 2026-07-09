import cron from "node-cron";
import weeklyEmailService from "../services/weeklyEmailService.js";

export const startWeeklyEmailCron = () =>
{
    cron.schedule("0 0 * * 0", async () =>
    {
        try
        {
            await weeklyEmailService.sendWeeklyEmails();
        }
        catch (error)
        {
            console.error("[EMAIL] Weekly email job failed:", error.message);
        }
    });

    console.log("[EMAIL] Weekly email cron started.");
};