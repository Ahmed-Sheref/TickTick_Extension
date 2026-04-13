import { errorHandler, asyncHandler } from '../utils/errorHandler.js';

/**
 * 404 Not Found Handler
 */
export const notFound = (req, res, next) => 
{
    const error = new Error(`Not Found - ${req.originalUrl}`);
    error.status = 404;
    next(error);
};

/**
 * Global Error Handler Middleware
 * This should be the last middleware in the stack
 */
export const globalErrorHandler = errorHandler;

/**
 * Async Error Handler Wrapper
 * Use this to wrap async route handlers to avoid try/catch blocks
 */
export const { asyncHandler } = errorHandler;

/**
 * Request Logger (optional but helpful for debugging)
 */
export const requestLogger = (req, res, next) => 
{
    console.log(`[REQUEST] ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
};
