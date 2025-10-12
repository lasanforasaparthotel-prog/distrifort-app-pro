/*
ESTE ARCHIVO NO SE DEBE CARGAR EN EL FRONTEND (React).
Debe implementarse como una función sin servidor (Serverless Function) 
en tu plataforma de hosting (Ej: Google Cloud Functions, Vercel Edge Functions, AWS Lambda).

Función: Recibir la solicitud del frontend, añadir la clave de API (oculta del cliente) y
reenviarla al servicio de Gemini.
*/

// --- CONFIGURACIÓN DE SEGURIDAD (EN TORNO REAL, ESTO SERÍA SECRETO) ---
// NOTA: En Vercel, esta variable se reemplaza automáticamente por el valor que ingresaste
// en el panel de Variables de Entorno (GEMINI_API_KEY).
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_SECURE_GEMINI_API_KEY_HERE"; 
const BASE_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// --- SERVERLESS FUNCTION HANDLER (Para Vercel) ---
// Vercel usa la convención Node.js para las funciones dentro de la carpeta 'api'.
export default async function (request) {
    // 1. Vercel Cloud Functions usa .json() para leer el cuerpo
    const url = new URL(request.url);
    const endpoint = url.searchParams.get('endpoint'); 
    
    if (!endpoint) {
        return new Response(JSON.stringify({ error: "Missing endpoint" }), { status: 400 });
    }

    try {
        const payload = await request.json();
        const model = payload.model || "gemini-2.5-flash-preview-05-20";

        // 2. Construir la URL completa con la clave de API secreta
        const apiUrl = `${BASE_GEMINI_URL}/${model}:${endpoint}?key=${GEMINI_API_KEY}`;
        
        // 3. Realizar la llamada real a la API de Google Gemini
        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await geminiResponse.json();

        // 4. Devolver la respuesta a la aplicación React (Frontend)
        return new Response(JSON.stringify(data), {
            status: geminiResponse.status,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("Error calling Gemini API from Proxy:", error);
        return new Response(JSON.stringify({ error: "Internal AI service failure" }), { status: 500 });
    }
}
