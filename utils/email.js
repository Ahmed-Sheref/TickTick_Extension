import sgMail from '@sendgrid/mail';
import { weeklyEmailTemplate } from './emailTemplate.js';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

console.log(process.env.SENDGRID_API_KEY)

export const sendWeeklyEmail = async (email, contents) => 
{
    try 
    {
        await sgMail.send(
        {
            to: email,
            from: 
            {
                email: process.env.SENDGRID_FROM_EMAIL,
                name: process.env.SENDGRID_FROM_NAME || 'TickTick',
            },
            subject: `Your Weekly Digest — ${contents.length} Articles`,
            html: weeklyEmailTemplate(contents),
        });

    console.log('Email sent to:', email);
    } 
        catch (error) 
    {
        console.error('SendGrid Error:', error.response?.body || error.message);
    }
};