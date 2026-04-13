import rateLimit from 'express-rate-limit';

/**
 * General rate limiter for all routes
 * 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit(
{
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, 
    message: {
      status: 'error',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Strict rate limiter for sensitive routes (auth, content creation)
 * 20 requests per 15 minutes per IP
 */
export const strictLimiter = rateLimit(
{
    windowMs: 15 * 60 * 1000, 
    max: 20, 
    message: 
    {
        status: 'error',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Very strict rate limiter for authentication routes
 * 5 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit(
{
    windowMs: 15 * 60 * 1000, 
    max: 5, 
    message: 
    {
        status: 'error',
        message: 'Too many authentication attempts, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate limiter for API routes that might be called frequently
 * 200 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit(
{
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: 
    {
        status: 'error',
        message: 'API rate limit exceeded, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
