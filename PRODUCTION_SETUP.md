# Production Setup Guide

## 📁 File Structure

```
middleware/
├── errorMiddleware.js    # Global error handling middleware
└── rateLimiter.js      # Rate limiting configurations

utils/
├── errorHandler.js       # Centralized error handling utility
└── ...existing files

Routes/
├── contentRoute.js       # Updated with asyncHandler
├── userRoute.js         # Updated with asyncHandler
└── ...existing routes

index.js                 # Updated with middleware integration
```

## 🚀 Implementation Complete

### 1. Rate Limiting (`middleware/rateLimiter.js`)

- **General Limiter**: 100 requests/15min (applied globally)
- **Strict Limiter**: 20 requests/15min (content routes)
- **Auth Limiter**: 5 requests/15min (TickTick auth routes)
- **API Limiter**: 200 requests/15min (available for future use)

### 2. Error Handling (`utils/errorHandler.js`)

**Handles:**
- ✅ Mongoose CastError, ValidationError, DuplicateKey
- ✅ ObjectId format errors
- ✅ JWT errors (if implemented)
- ✅ Async errors without status
- ✅ Development vs Production responses

**Response Format:**
```json
{
  "status": "error",
  "message": "Error description",
  "stack": "stack trace (development only)",
  "type": "ErrorType",
  "details": [...],
  "field": "fieldName"
}
```

### 3. Middleware Integration (`middleware/errorMiddleware.js`)

- **404 Handler**: Catches undefined routes
- **Global Error Handler**: Last middleware in stack
- **Async Handler Wrapper**: Eliminates try/catch blocks
- **Request Logger**: Optional debugging middleware

## 🔧 Integration in `index.js`

```javascript
// 1. Import middleware
import { generalLimiter, strictLimiter, authLimiter } from './middleware/rateLimiter.js';
import { notFound, globalErrorHandler, requestLogger } from './middleware/errorMiddleware.js';

// 2. Apply middleware in correct order
app.use(requestLogger);                    // Optional logging
app.use(express.json({ limit: '10mb' }));  // Body parsing
app.use(generalLimiter);                 // Global rate limiting

// 3. Routes with specific limits
app.use("/api/v1/content", strictLimiter, contentRouter);
app.use('/api/v1/ticktick', authLimiter, ticktickRoute);

// 4. Error handlers (must be last)
app.use(notFound);           // 404 handler
app.use(globalErrorHandler);   // Global error handler
```

## 📝 Route Usage Example

### Before (with try/catch):
```javascript
router.post('/email', async (req, res) => {
    try {
        // ...logic
        res.json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});
```

### After (with asyncHandler):
```javascript
import { asyncHandler } from '../middleware/errorMiddleware.js';

router.post('/email', asyncHandler(async (req, res) => {
    const validationError = validateInput(req.body);
    
    if (validationError) {
        const error = new Error(validationError);
        error.status = 400;
        throw error;  // Will be caught by global handler
    }

    // ...logic
    res.json({ status: 'success' });
}));
```

## 🛡️ Security Benefits

### Rate Limiting:
- Prevents DoS attacks
- Protects sensitive endpoints
- Configurable per-route limits
- Proper JSON error responses

### Error Handling:
- No sensitive data leaks in production
- Consistent error format
- Centralized logging
- Automatic async error catching

## 🔄 Environment Variables

Add to your `.env` file:
```env
NODE_ENV=production  # or development
```

## 📊 Rate Limit Responses

When limits are exceeded:
```json
{
  "status": "error",
  "message": "Too many requests from this IP, please try again later.",
  "retryAfter": "15 minutes"
}
```

Headers included:
- `RateLimit-Limit`: Max requests per window
- `RateLimit-Remaining`: Remaining requests
- `RateLimit-Reset`: Time when limit resets

## 🚨 Error Examples

### Validation Error (400):
```json
{
  "status": "error",
  "message": "Validation Error: email is required and must be a non-empty string, userId is required and must be a non-empty string",
  "type": "ValidationError",
  "details": ["email is required and must be a non-empty string", "userId is required and must be a non-empty string"]
}
```

### Duplicate Key Error (409):
```json
{
  "status": "error", 
  "message": "userId already exists",
  "type": "DuplicateKeyError",
  "field": "userId"
}
```

### Cast Error (400):
```json
{
  "status": "error",
  "message": "Invalid _id: invalidObjectId",
  "type": "CastError"
}
```

## ✅ Production Ready Features

1. **Centralized Error Handling**: All errors handled consistently
2. **Rate Limiting**: Multiple tiers for different route types
3. **Security**: No stack traces in production
4. **Logging**: Structured error logging with context
5. **Performance**: Reduced boilerplate code
6. **Maintainability**: Modular, reusable components

## 🧪 Testing

Test rate limiting:
```bash
# Test general limiter (should work 100 times)
for i in {1..101}; do
  curl -X POST http://localhost:3000/api/v1/content \
    -H "Content-Type: application/json" \
    -d '{"userId":"test","title":"test","rawText":"test"}'
done

# Test auth limiter (should fail after 5 times)
for i in {1..6}; do
  curl http://localhost:3000/api/v1/ticktick/auth
done
```

Test error handling:
```bash
# Invalid ObjectId
curl http://localhost:3000/api/v1/content/user/invalidId

# Missing required fields
curl -X POST http://localhost:3000/api/v1/content \
  -H "Content-Type: application/json" \
  -d '{"title":"test"}'  # Missing userId and rawText
```

## 📦 Dependencies Added

```bash
npm install express-rate-limit
```

All existing functionality preserved! 🎉
