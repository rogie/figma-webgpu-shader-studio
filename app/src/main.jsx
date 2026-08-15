import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import FigmaOAuthCallback from "./components/FigmaOAuthCallback.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { isFigmaOAuthCallback } from "./services/figmaShaders.js";
import "reset-css";
import "@rogieking/figui3/fig.css";
import "@rogieking/figui3/fig.js";
import "@rogieking/figui3/fig-editor.css";
import "@rogieking/figui3/fig-editor.js";
// 8.1+ no longer pulls lab styles through fig-editor.css — import explicitly.
import "@rogieking/figui3/fig-lab.css";
import "@rogieking/figui3/fig-lab.js";
import "./app.css";

const playground = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get("playground")
  : null;
const showStreamingCodePlayground = playground === "streaming-code";
const showChatComposerPlayground = playground === "chat-composer";
const showToastPlayground = playground === "toasts";
const StreamingCodeBlockPlayground = showStreamingCodePlayground
  ? lazy(() => import("./components/StreamingCodeBlockPlayground.jsx"))
  : null;
const ChatComposerPlayground = showChatComposerPlayground
  ? lazy(() => import("./components/ChatComposerPlayground.jsx"))
  : null;
const ToastPlayground = showToastPlayground
  ? lazy(() => import("./components/ToastPlayground.jsx"))
  : null;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {showStreamingCodePlayground ? (
      <Suspense fallback={null}>
        <StreamingCodeBlockPlayground />
      </Suspense>
    ) : showChatComposerPlayground ? (
      <Suspense fallback={null}>
        <ChatComposerPlayground />
      </Suspense>
    ) : showToastPlayground ? (
      <Suspense fallback={null}>
        <ToastPlayground />
      </Suspense>
    ) : (
      <AuthProvider>
        {isFigmaOAuthCallback() ? <FigmaOAuthCallback /> : <App />}
      </AuthProvider>
    )}
  </StrictMode>
);
