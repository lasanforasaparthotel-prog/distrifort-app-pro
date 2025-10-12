// Función serverless compatible con Vercel
// Sirve como proxy para proteger tu clave privada de Gemini

import { GoogleGenAI } from "@google/genai";

// 🔐 En Vercel, la variable GEMINI_API_KEY se configura desde el panel:
// Settings → Environment Variables → Add → GEMINI_API_KEY = tu_clave_real

const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  // --- Configurar CORS para que el frontend pueda acceder ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    // Asegurarse de que el body venga como JSON
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { prompt } = body;

    if (!prompt) {
      return res.status(400).json({ error: "Falta el campo 'prompt' en el body" });
    }

    // --- Llamada al modelo Gemini ---
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    // Extraer texto del resultado
    const text =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No se recibió respuesta del modelo.";

    // Responder al frontend
    res.status(200).json({ text });
  } catch (err) {
    console.error("Error en Gemini Proxy:", err);
    res.status(500).json({ error: "Error interno en el servidor Gemini." });
  }
}
