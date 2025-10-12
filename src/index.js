import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import DistriFortApp from "./DistriFortApp";

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<DistriFortApp />);
