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
          "ai_tags": ["tags..."],
          "quiz": {
            "question": "A challenge question based on the text",
            "options": ["A", "B", "C", "D"],
            "correctAnswer": "The correct option text"
          }
        }
        
        IMPORTANT TAGS RULES:
        - Return ONLY 3-5 main technical tags maximum
        - Focus on core technologies and concepts
        - Avoid generic words like "tutorial", "guide", "learn"
        - Use lowercase, single words, no spaces
        - Examples: "react", "javascript", "nodejs", "mongodb", "api", "css", "html"
        
        LANGUAGE HANDLING:
        - Support both English and Arabic text
        - For Arabic content, generate English summary and quiz
        - Tags should be in English regardless of content language
        - Preserve original text encoding and meaning
        
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