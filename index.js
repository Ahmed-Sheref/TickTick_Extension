import express from "express";
import contentRouter from "./Routes/contentRoute.js";
import ticktickRouter from "./Routes/ticktickRoute.js";
import googleAuthRouter from "./Routes/googleAuthRoute.js";
import ticktickLinkRouter from "./Routes/ticktickLinkRoute.js";
import notionLinkRouter from "./Routes/notionLinkRoute.js";
import notionContentRouter from "./Routes/notionContentRoute.js";
import settingsRouter from './Routes/userRoute.js';
import telegramRouter from './Routes/telegramRoute.js';
// import { generalLimiter, strictLimiter, authLimiter } from './middleware/rateLimiter.js';
import { notFound, globalErrorHandler, requestLogger } from './middleware/errorMiddleware.js';
import { setupSwagger } from './swagger/UI/swagger-ui.js';
import requireAuth from "./middleware/requireAuth.js";

const app = express();

// Request logging (optional but helpful)

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(requestLogger);
setupSwagger(app);

// app.use(generalLimiter);

app.use('/api/v1/ticktick', /*authLimiter */ ticktickRouter);  // Auth routes need strict limiting
app.use('/api/v1/auth/google', googleAuthRouter);
app.use('/api/v1/integrations/ticktick', ticktickLinkRouter);
app.use('/api/v1/integrations/notion', notionLinkRouter);
app.use('/api/v1/integrations/notion', notionContentRouter);
app.use('/api/v1/User', requireAuth, settingsRouter);
app.use("/api/v1/content", requireAuth, contentRouter);
app.use('/api/v1/telegram', telegramRouter);

app.use(notFound);

app.use(globalErrorHandler);

export default app;
