import React from "react";
import { createRoot } from "react-dom/client";
// Importamos los estilos globales
import "./index.css";
// Importamos el componente principal. Asegúrate de que esta ruta sea correcta:
import DistriFortApp from "./App"; // Si el archivo se llama App.jsx

const container = document.getElementById("root");
const root = createRoot(container);
// Usamos StrictMode para desarrollo
root.render(
  <React.StrictMode>
    <DistriFortApp />
  </React.StrictMode>
);
