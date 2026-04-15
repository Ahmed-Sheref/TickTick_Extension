import express from 'express';
import Settings from '../Models/User.js';
import { asyncHandler } from '../middleware/errorMiddleware.js';

const router = express.Router();

const validateEmailInput = ({ userId, email, weeklyEmailEnabled }) =>
{
    if (!userId || typeof userId !== 'string' || userId.trim() === '')
    {
        return 'userId is required and must be a non-empty string';
    }

    if (!email || typeof email !== 'string' || email.trim() === '')
    {
        return 'email is required and must be a non-empty string';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim()))
    {
        return 'email must be a valid email address';
    }

    if (weeklyEmailEnabled !== undefined && typeof weeklyEmailEnabled !== 'boolean')
    {
        return 'weeklyEmailEnabled must be a boolean value';
    }

    return null;
};

const validateQuizPreferencesInput = ({ userId, receiveTelegramQuiz }) =>
{
    if (!userId || typeof userId !== 'string' || userId.trim() === '')
    {
        return 'userId is required and must be a non-empty string';
    }

    if (typeof receiveTelegramQuiz !== 'boolean')
    {
        return 'receiveTelegramQuiz must be a boolean value';
    }

    return null;
};

router.post('/email', asyncHandler(async (req, res) =>
{
    const { userId, email, weeklyEmailEnabled } = req.body;

    const validationError = validateEmailInput({ userId, email, weeklyEmailEnabled });

    if (validationError)
    {
        const error = new Error(validationError);
        error.status = 400;
        throw error;
    }

    await Settings.findOneAndUpdate(
        { userId },
        { email, weeklyEmailEnabled },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(
    {
        status: 'success',
        message: 'Email settings updated!'
    });
}));

router.post('/quiz-preferences', asyncHandler(async (req, res) =>
{
    const { userId, receiveTelegramQuiz } = req.body;

    const validationError = validateQuizPreferencesInput({ userId, receiveTelegramQuiz });

    if (validationError)
    {
        const error = new Error(validationError);
        error.status = 400;
        throw error;
    }

    const updatedUser = await Settings.findOneAndUpdate(
        { userId },
        { receiveTelegramQuiz },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(
    {
        status: 'success',
        message: 'Quiz preferences updated!',
        data: 
        {
            userId: updatedUser.userId,
            receiveTelegramQuiz: updatedUser.receiveTelegramQuiz
        }
    });
}));

router.get('/preferences/:userId', asyncHandler(async (req, res) =>
{
    const { userId } = req.params;

    if (!userId || typeof userId !== 'string' || userId.trim() === '')
    {
        const error = new Error('userId is required and must be a non-empty string');
        error.status = 400;
        throw error;
    }

    const user = await Settings.findOne({ userId }).lean();

    res.json(
    {
        status: 'success',
        data: 
        {
            userId,
            email: user?.email ?? '',
            weeklyEmailEnabled: user?.weeklyEmailEnabled ?? false,
            receiveTelegramQuiz: user?.receiveTelegramQuiz ?? true,
            telegramConnected: user?.telegramConnected ?? false,
            telegramChatId: user?.telegramChatId ?? null
        }
    });
}));

export default router;