import express from 'express';
import Settings from '../Models/User.js';

const router = express.Router();

router.post('/email', async (req, res) =>
{
    try
    {
        const { userId, email, weeklyEmail } = req.body;

        if (!userId || !email)
        {
            return res.status(400).json(
            {
                status: 'error',
                message: 'userId and email are required'
            });
        }

        await Settings.findOneAndUpdate(
            { userId },
            { email, weeklyEmail },
            { upsert: true, new: true }
        );

        res.json(
        {
            status: 'success',
            message: 'Email settings updated!'
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