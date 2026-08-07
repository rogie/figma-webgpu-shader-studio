import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import "reset-css";
import "@rogieking/figui3/fig.css";
import "@rogieking/figui3/fig.js";
import "@rogieking/figui3/fig-editor.css";
import "@rogieking/figui3/fig-editor.js";
import "@rogieking/figui3/fig-lab.js";
import "./app.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
