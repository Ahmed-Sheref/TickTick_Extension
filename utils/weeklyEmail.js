import cron from 'node-cron';
import Settings from '../Models/User.js';
import Content from '../Models/Content.js';
import { sendWeeklyEmail } from './email.js';

export const startWeeklyEmailCron = () =>
{

    cron.schedule('* * * * *', async () =>
    {
        console.log('Starting weekly email job...');

        try
        {
            const users = await Settings.find(
            {
                weeklyEmail: true,
                email: { $exists: true, $ne: null }
            });

            console.log(`Found ${users.length} users to email`);

            for (const user of users)
            {
                try
                {
                    const oneWeekAgo = new Date();
                    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

                    const contents = await Content.find(
                    {
                        userId: user.userId,
                        createdAt: { $gte: oneWeekAgo }
                    });

                    if (contents.length === 0)
                    {
                        console.log(`No articles for ${user.email} this week`);
                        continue;
                    }

                    await sendWeeklyEmail(user.email, contents);
                }
                catch (userError)
                {
                    console.error(`Failed for ${user.email}:`, userError.message);
                }
            }

            console.log('Weekly email job done!');
        }
        catch (error)
        {
            console.error('Weekly email job failed:', error.message);
        }
    });

    console.log(' Weekly email cron started');
};