export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    try {
        const { prompt } = await req.json();
        // Vercel inyectará la clave secreta aquí de forma segura
        const apiKey = process.env.GEMINI_API_KEY; 
        
        if (!apiKey) {
             return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error from Gemini API:", errorText);
            return new Response(JSON.stringify({ error: `Gemini API error: ${response.statusText}` }), { status: response.status });
        }

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        
        return new Response(JSON.stringify({ text }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Error in proxy function:", error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
}

