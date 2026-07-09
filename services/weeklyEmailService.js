import User from "../Models/User.js";
import Content from "../Models/Content.js";
import { sendWeeklyEmail } from "../utils/email.js";

const getUsersForWeeklyEmail = async () =>
{
    return User.find(
    {
        weeklyEmailEnabled: true,
        email: { $exists: true, $ne: null }
    });
};

const getOneWeekAgo = () =>
{
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return oneWeekAgo;
};

const getWeeklyEmailContents = async (userId) =>
{
    const oneWeekAgo = getOneWeekAgo();

    return Content.find(
    {
        userId,
        "options.includeInWeeklyEmail": true,
        summary: { $ne: null },
        lastEmailedAt: null,
        createdAt: { $gte: oneWeekAgo }
    })
    .sort({ createdAt: -1 });
};

const markContentsAsEmailed = async (contents) =>
{
    await Content.updateMany(
        {
            _id:
            {
                $in: contents.map(content => content._id)
            }
        },
        {
            $set:
            {
                lastEmailedAt: new Date()
            }
        }
    );
};

const sendWeeklyEmailToUser = async (user) =>
{
    const contents = await getWeeklyEmailContents(user.userId);

    if (contents.length === 0)
    {
        console.log(`[EMAIL] No articles for ${user.email} this week`);
        return;
    }

    await sendWeeklyEmail(user.email, contents);

    await markContentsAsEmailed(contents);

    console.log(`[EMAIL] Weekly email sent to ${user.email}`);
};

const sendWeeklyEmails = async () =>
{
    console.log("[EMAIL] Starting weekly email job.");

    const users = await getUsersForWeeklyEmail();

    console.log(`[EMAIL] Found ${users.length} users to send emails`);

    for (const user of users)
    {
        try
        {
            await sendWeeklyEmailToUser(user);
        }
        catch (userError)
        {
            console.error(`[EMAIL] Failed for ${user.email}:`, userError.message);
        }
    }

    console.log("[EMAIL] Weekly email job completed.");
};

export default {
    sendWeeklyEmails
};