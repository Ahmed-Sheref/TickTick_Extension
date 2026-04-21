import cron from 'node-cron';
import User from '../Models/User.js';
import Content from '../Models/Content.js';
import { sendWeeklyEmail } from './email.js';

export const startWeeklyEmailCron = () =>
{
    cron.schedule('*/20 * * * * *', async () =>
    {
        console.log('[EMAIL] Starting weekly email job...');

        try
        {
            const users = await User.find(
            {
                weeklyEmailEnabled: true,
                email: { $exists: true, $ne: null }
            });

            console.log(`[EMAIL] Found ${users.length} users to email`);

            for (const user of users)
            {
                try
                {
                    const oneWeekAgo = new Date();
                    oneWeekAgo.setDate(oneWeekAgo.getMinutes() - 5);

                    const contents = await Content.find(
                    {
                        userId: user.userId,
                        "options.includeInWeeklyEmail": true,
                        summary: { $ne: null }
                        // lastEmailedAt: null,
                        // createdAt: { $gte: oneWeekAgo }
                    })
                    .sort({ createdAt: -1 });

                    if (contents.length === 0)
                    {
                        console.log(`[EMAIL] No articles for ${user.email} this week`);
                        continue;
                    }

                    await sendWeeklyEmail(user.email, contents);

                    await Content.updateMany(
                        { _id: { $in: contents.map(content => content._id) } },
                        { $set: { lastEmailedAt: new Date() } }
                    );

                    console.log(`[EMAIL] Weekly email processed for ${user.email}`);
                }
                catch (userError)
                {
                    console.error(`[EMAIL] Failed for ${user.email}:`, userError.message);
                }
            }

            console.log('[EMAIL] Weekly email job completed');
        }
        catch (error)
        {
            console.error('[EMAIL] Weekly email job failed:', error.message);
        }
    });

    console.log('[EMAIL] Weekly email cron started');
};