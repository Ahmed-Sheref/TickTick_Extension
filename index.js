import express from "express";
import contentRouter from "./Routes/contentRoute.js";
import dotenv from 'dotenv';
import ticktickRouter from "./Routes/ticktickRoute.js";

const app = express();

app.use(express.json());

app.use("/api/v1/content", contentRouter);
app.use('/api/v1/ticktick', ticktickRouter);

export default app;



