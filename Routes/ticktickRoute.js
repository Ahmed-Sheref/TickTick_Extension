import express from 'express';
import Settings from '../Models/User.js';
import { getAuthUrl, exchangeToken } from '../utils/ticktick.js';

const router = express.Router();

router.get('/auth/:userId', (req, res) =>
{
    const { userId } = req.params;
    const url = getAuthUrl(userId);
    res.redirect(url);
});

router.get('/callback', async (req, res) =>
{
    try
    {
        const { code, state: userId } = req.query;

        if (!code || !userId)
        {
            return res.status(400).json(
            {
                status: 'error',
                message: 'Missing code or userId'
            });
        }

        const tokenData = await exchangeToken(code);

        const user = await Settings.findOneAndUpdate(
            { userId },
            {
                tickTickAccessToken: tokenData.access_token,
                tickTickRefreshToken: tokenData.refresh_token,
                tickTickConnected: true
            },
            { upsert: true, new: true }
        );
        console.log('User found:', user);
        console.log('tickTickConnected:', user?.tickTickConnected);
        console.log('tickTickAccessToken:', user?.tickTickAccessToken);

        res.json(
        {
            status: 'success',
            message: 'TickTick connected successfully!'
        });
    }
    catch (error)
    {
        res.status(500).json(
        {
            status: 'error',
            message: error.message
        });
    }
});

export default router;