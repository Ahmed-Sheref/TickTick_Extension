import cron from "node-cron";
import cleanup from "../services/imageCleanupService.js";

export function startImageCleanupCron()
{
    let running = false;
    const run = async () =>
    {
        if (running) return;
        running = true;
        try
        {
            await cleanup();
        }
        catch
        {
            console.error("[IMAGES] Cleanup job failed");
        }
        finally
        {
            running = false;
        }
    };
    const task = cron.schedule("*/15 * * * *", run);
    void run();
    return task;
}
