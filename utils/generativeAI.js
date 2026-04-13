import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const MODEL_NAME = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const buildPrompt = (text) => `
You must respond with ONLY a valid JSON object.
No explanation, no markdown, no code fences, no extra text.

Structure:
{
  "summary": "bullet1. bullet2. bullet3.",
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
- Tags must be in English

LANGUAGE HANDLING:
- Support both English and Arabic text
- For Arabic content, generate English summary and quiz
- Preserve original meaning

Text to analyze:
${text}
`;

const validateAiResponse = (data) =>
{
    if (!data || typeof data !== "object") throw new Error("Invalid AI response object");

    if (typeof data.summary !== "string") data.summary = "";

    if (!Array.isArray(data.ai_tags)) data.ai_tags = [];

    if (!data.quiz || typeof data.quiz !== "object" || typeof data.quiz.question !== "string" || !Array.isArray(data.quiz.options) || typeof data.quiz.correctAnswer !== "string")
    {
        data.quiz = null;
    }

    return data;
};

const extractJson = (text) =>
{
    const clean = text.replace(/```json|```/gi, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);

    if (!match) throw new Error("No JSON object found in AI response");

    return JSON.parse(match[0]);
};

const analyzeContent = async (text) =>
{
    if (typeof text !== "string" || !text.trim()) throw new Error("Text is required for AI analysis");

    const safeText = text.trim().slice(0, 12000);

    try
    {
        const result = await groq.chat.completions.create({
            model: MODEL_NAME,
            temperature: 0.3,
            messages: [
                {
                    role: "user",
                    content: buildPrompt(safeText)
                }
            ]
        });

        const outputText = result.choices?.[0]?.message?.content;

        if (!outputText)
        {
            throw new Error("Empty response from Groq");
        }

        const parsed = extractJson(outputText);
        return validateAiResponse(parsed);
    }
    catch (error)
    {
        console.error("Groq AI Error:", error.message);
        throw new Error(`Groq AI Error: ${error.message}`);
    }
};

export default analyzeContent;