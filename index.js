import express from "express";
import contentRouter from "./Routes/contentRoute.js";
import ticktickRouter from "./Routes/ticktickRoute.js";
import settingsRouter from './Routes/userRoute.js';
import telegramRouter from './Routes/telegramRoute.js';
import { generalLimiter, strictLimiter, authLimiter } from './middleware/rateLimiter.js';
import { notFound, globalErrorHandler, requestLogger } from './middleware/errorMiddleware.js';
import { setupSwagger } from './swagger/UI/swagger-ui.js';
const app = express();

// Request logging (optional but helpful)
app.use(requestLogger);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Setup Swagger UI documentation
setupSwagger(app);

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Routes with specific rate limiting
app.use("/api/v1/content", strictLimiter, contentRouter);
app.use('/api/v1/ticktick', authLimiter, ticktickRouter);  // Auth routes need strict limiting
app.use('/api/v1/User', settingsRouter);
app.use('/api/v1/telegram', telegramRouter);

// 404 handler (must be after all routes)
app.use(notFound);

// Global error handler (must be last)
app.use(globalErrorHandler);

export default app;



