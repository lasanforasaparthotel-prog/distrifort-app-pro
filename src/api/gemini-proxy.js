// api/gemini-proxy.js (Para Vercel/Netlify Serverless Function)

// En Vercel o Netlify, esta variable debe configurarse en el panel de control (ej: GEMINI_API_KEY)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_SECURE_GEMINI_API_KEY_HERE"; 
const BASE_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Función handler para el servidor sin servidor (Serverless Function)
export default async function handler(request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
    }

    const url = new URL(request.url);
    const endpoint = url.searchParams.get('endpoint'); 

    if (!endpoint) {
        return new Response(JSON.stringify({ error: "Missing endpoint parameter" }), { status: 400 });
    }

    try {
        const payload = await request.json();
        const model = payload.model || "gemini-2.5-flash-preview-05-20";

        // Llama a la API de Google, usando la clave segura del servidor
        const apiUrl = `${BASE_GEMINI_URL}/${model}:${endpoint}?key=${GEMINI_API_KEY}`;
        
        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await geminiResponse.json();

        // Devuelve la respuesta directamente al frontend de React
        return new Response(JSON.stringify(data), {
            status: geminiResponse.status,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("Error calling Gemini API from Proxy:", error);
        return new Response(JSON.stringify({ error: "Internal AI service failure or invalid payload." }), { status: 500 });
    }
}
