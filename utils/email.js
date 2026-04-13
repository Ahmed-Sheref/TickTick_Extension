import nodemailer from 'nodemailer';
import { weeklyEmailTemplate } from './emailTemplate.js';

const transporter = nodemailer.createTransport(
{
    service: 'gmail',
    auth: 
    {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

export const sendWeeklyEmail = async (email, contents) =>
{
    try
    {
        await transporter.sendMail(
        {
            from: `"TickTick Extension" no reply`,
            to: email,
            subject: `Your Weekly Digest — ${contents.length} Articles`,
            html: weeklyEmailTemplate(contents)
        });

        console.log(`[EMAIL] Weekly email sent to ${email}`);
    }
    catch (error)
    {
        console.error('[EMAIL] Failed to send email:', error.message);
        throw new Error(`Failed to send email: ${error.message}`);
    }
};