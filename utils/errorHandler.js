const isDevelopment = process.env.NODE_ENV === 'development';

// Mongoose error codes
const MONGOOSE_ERRORS =
{
    CAST_ERROR: 'CastError',
    VALIDATION_ERROR: 'ValidationError',
    DUPLICATE_KEY: 11000,
    OBJECT_ID: 'ObjectId'
};

const handleMongooseError = (error) =>
{
    if (error.name === MONGOOSE_ERRORS.CAST_ERROR)
    {
        return {
            status: 400,
            message: `Invalid ${error.path}: ${error.value}`,
            type: 'CastError'
        };
    }

    if (error.name === MONGOOSE_ERRORS.VALIDATION_ERROR)
    {
        const errors = Object.values(error.errors).map(err => err.message);

        return {
            status: 400,
            message: `Validation Error: ${errors.join(', ')}`,
            type: 'ValidationError',
            details: errors
        };
    }

    if (error.code === MONGOOSE_ERRORS.DUPLICATE_KEY)
    {
        const field = Object.keys(error.keyValue)[0];

        return {
            status: 409,
            message: `${field} already exists`,
            type: 'DuplicateKeyError',
            field
        };
    }

    if (error.message.includes(MONGOOSE_ERRORS.OBJECT_ID))
    {
        return {
            status: 400,
            message: 'Invalid ID format',
            type: 'ObjectIdError'
        };
    }

    return null;
};

const handleValidationError = (error) =>
{
    if (typeof error === 'string')
    {
        return {
            status: 400,
            message: error,
            type: 'ValidationError'
        };
    }

    if (error.message)
    {
        return {
            status: 400,
            message: error.message,
            type: 'ValidationError'
        };
    }

    return {
        status: 400,
        message: 'Validation failed',
        type: 'ValidationError'
    };
};

const createErrorResponse = (error, req) =>
{
    console.error(`[ERROR] ${req.method} ${req.path}:`, error);

    const mongooseError = handleMongooseError(error);

    if (mongooseError)
    {
        return {
            status: 'error',
            message: mongooseError.message,
            ...(isDevelopment &&
            {
                stack: error.stack,
                type: mongooseError.type,
                details: mongooseError.details,
                field: mongooseError.field
            })
        };
    }

    if (error.name === 'ValidationError' || error.status === 400)
    {
        const validationError = handleValidationError(error);

        return {
            status: 'error',
            message: validationError.message,
            ...(isDevelopment &&
            {
                stack: error.stack,
                type: validationError.type
            })
        };
    }

    if (error.name === 'JsonWebTokenError')
    {
        return {
            status: 'error',
            message: 'Invalid token',
            ...(isDevelopment &&
            {
                stack: error.stack,
                type: 'JWTError'
            })
        };
    }

    if (error.name === 'TokenExpiredError')
    {
        return {
            status: 'error',
            message: 'Token expired',
            ...(isDevelopment &&
            {
                stack: error.stack,
                type: 'JWTExpiredError'
            })
        };
    }

    if (!error.status)
    {
        return {
            status: 'error',
            message: isDevelopment ? error.message : 'Internal server error',
            ...(isDevelopment &&
            {
                stack: error.stack,
                type: 'UnhandledError'
            })
        };
    }

    return {
        status: 'error',
        message: error.message,
        ...(isDevelopment &&
        {
            stack: error.stack,
            type: 'StatusError'
        })
    };
};

export const errorHandler = (error, req, res, next) =>
{
    const errorResponse = createErrorResponse(error, req);

    const statusCode =
        errorResponse.type === 'ValidationError' ? 400 :
        errorResponse.type === 'DuplicateKeyError' ? 409 :
        errorResponse.type === 'CastError' ? 400 :
        errorResponse.type === 'ObjectIdError' ? 400 :
        error.status || 500;

    res.status(statusCode).json(errorResponse);
};

export const asyncHandler = (fn) =>
{
    return (req, res, next) =>
    {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

export class AppError extends Error
{
    constructor(message, statusCode)
    {
        super(message);

        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}