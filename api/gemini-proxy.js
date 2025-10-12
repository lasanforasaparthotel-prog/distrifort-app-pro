// Función Serverless (Proxy) para Vercel o Netlify
// Protege tu clave de Gemini

import { GoogleGenAI } from '@google/genai';

// La clave GEMINI_API_KEY se inyecta automáticamente por Vercel desde las Variables de Entorno.
const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Missing prompt in request body.' });
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "Eres un asistente de ventas de software de distribución. Tu tarea es generar respuestas concisas, profesionales y amigables. Utiliza emojis y un tono de WhatsApp para comunicación con clientes.",
            },
        });

        res.status(200).json({ text: response.text });
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        res.status(500).json({ error: 'Internal Server Error during AI generation.' });
    }
}
