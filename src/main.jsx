import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
// --- ASEGÚRATE DE QUE LA RUTA DE IMPORTACIÓN COINCIDA CON EL NOMBRE ---
import DistriFortApp from "./app"; // O "./app.jsx" dependiendo de tu configuración de entorno.

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<DistriFortApp />);
