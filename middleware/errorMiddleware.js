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


export const globalErrorHandler = errorHandler;


export { asyncHandler };


export const requestLogger = (req, res, next) =>
{
    console.log(`[REQUEST] ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
};