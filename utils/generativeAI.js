import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config({path: 'D:\\Programming\\Back_end\\TickTick_EXTENSION\\config.env'});

const analyzeContent = async (text) =>
{
    try
    {
        const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

        const prompt = `
        You must respond with ONLY a valid JSON object, no explanation, no markdown, no extra text.
        Structure:
        {
          "summary": "bullet1. bullet2. bullet3." ,
          "ai_tags": ["tag1", "tag2", "tag3"],
          "quiz": {
            "question": "A challenge question based on the text",
            "options": ["A", "B", "C", "D"],
            "correctAnswer": "The correct option text"
          }
        }
        Text to analyze: ${text}`;

        const result = await client.chat.completions.create(
        {
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.3
        });

        const outputText = result.choices[0].message.content;

        const clean = outputText.replace(/```json|```/g, '').trim();
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        const data = JSON.parse(jsonMatch[0]);
        return data;
    }
    catch (error)
    {
        console.error("Gemini AI Error:", error.message);
        throw new Error(`Gemini AI Error: ${error.message}`);
    }
};

export default analyzeContent;