import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element not found");
}

createRoot(root).render(
  <React.StrictMode><App /></React.StrictMode>
);
