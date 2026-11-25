import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "highlight.js/styles/a11y-dark.min.css";
import "./assets/css/main.css";
import "@ionic/react/css/core.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("ACOMS-AI cannot start: #root element is missing from index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
