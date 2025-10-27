// Configuración para Vercel Edge Runtime
export const config = {
    runtime: 'edge',
};

// Modelos de Google AI a usar
const TEXT_MODEL = 'gemini-pro'; // Modelo para chat e importación de listas
const IMAGE_MODEL = 'imagen-3.0-generate-002'; // Modelo para generar imágenes promocionales

export default async function handler(req) {
    // 1. Verificar método POST
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        // 2. Leer datos del cuerpo (prompt y la nueva bandera isImage)
        const { prompt, isImage } = await req.json();

        if (!prompt) {
            return new Response(JSON.stringify({ error: 'Prompt is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // 3. Obtener la API Key secreta de las variables de entorno de Vercel
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("GEMINI_API_KEY environment variable not set in Vercel.");
            return new Response(JSON.stringify({ error: 'API key not configured on server' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }

        // 4. Determinar qué API de Google llamar basado en isImage
        let googleApiUrl;
        let googlePayload;
        const keyParam = `?key=${apiKey}`;

        if (isImage) {
            // Configuración para Imagen 3.0
            googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:predict${keyParam}`;
            googlePayload = {
                instances: { prompt: prompt },
                parameters: { "sampleCount": 1 } // Solicitar 1 imagen
            };
        } else {
            // Configuración para Gemini Pro (Texto)
            googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent${keyParam}`;
            googlePayload = {
                contents: [{ parts: [{ text: prompt }] }],
            };
        }

        // 5. Llamar a la API de Google
        const googleResponse = await fetch(googleApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(googlePayload),
        });

        // 6. Manejar la respuesta de Google
        if (!googleResponse.ok) {
            const errorText = await googleResponse.text();
            console.error(`Error from Google API (${googleResponse.status}):`, errorText);
            // Devolver un error claro al frontend
            return new Response(JSON.stringify({ error: `Google API Error: ${googleResponse.statusText}` }), { status: googleResponse.status, headers: { 'Content-Type': 'application/json' } });
        }

        const data = await googleResponse.json();

        // 7. Extraer y devolver la respuesta correcta al frontend
        let responsePayload;
        if (isImage) {
            // Extraer imagen base64 de Imagen 3.0
            const base64Data = data.predictions?.[0]?.bytesBase64Encoded;
            if (!base64Data) {
                console.error("Google API (Image) did not return valid image data:", data);
                return new Response(JSON.stringify({ error: 'Failed to generate image from API' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
            responsePayload = { imageUrl: `data:image/png;base64,${base64Data}` };
        } else {
            // Extraer texto de Gemini Pro
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                 console.error("Google API (Text) did not return valid text data:", data);
                 return new Response(JSON.stringify({ error: 'Failed to generate text from API' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
            responsePayload = { text: text };
        }

        // 8. Enviar respuesta exitosa al frontend
        return new Response(JSON.stringify(responsePayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        // Manejar errores generales del proxy
        console.error("Error executing proxy function:", error);
        return new Response(JSON.stringify({ error: 'Internal Server Error in proxy' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
