import express from "express";
import contentRouter from "./Routes/contentRoute.js";
import dotenv from 'dotenv';
import ticktickRouter from "./Routes/ticktickRoute.js";
import settingsRouter from './Routes/settingsRoute.js';

const app = express();

app.use(express.json());

app.use("/api/v1/content", contentRouter);
app.use('/api/v1/ticktick', ticktickRouter);
app.use('/api/v1/User', settingsRouter);

export default app;



