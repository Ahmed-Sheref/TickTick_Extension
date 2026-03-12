import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { weeklyEmailTemplate } from './emailTemplate.js';

dotenv.config({path: 'D:\\Programming\\Back_end\\TickTick_EXTENSION\\config.env'});

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

        console.log(`Email sent to ${email}`);
    }
    catch (error)
    {
        throw new Error(`Failed to send email: ${error.message}`);
    }
};