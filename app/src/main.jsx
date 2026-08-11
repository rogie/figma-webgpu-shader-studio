import { lazy, StrictMode, Suspense } from "react";
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

const showStreamingCodePlayground =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("playground") ===
    "streaming-code";
const StreamingCodeBlockPlayground = showStreamingCodePlayground
  ? lazy(() => import("./components/StreamingCodeBlockPlayground.jsx"))
  : null;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {showStreamingCodePlayground ? (
      <Suspense fallback={null}>
        <StreamingCodeBlockPlayground />
      </Suspense>
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>
);
