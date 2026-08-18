import { useEffect, useState } from "react";
import {
  completeFigmaOAuthCallback,
  peekFigmaOAuthIntent,
} from "../services/figmaShaders.js";

export default function FigmaOAuthCallback() {
  const [error, setError] = useState("");
  const [status] = useState(() =>
    peekFigmaOAuthIntent() === "signin"
      ? "Finishing Figma sign-in…"
      : "Finishing your Figma connection…"
  );

  useEffect(() => {
    let active = true;
    completeFigmaOAuthCallback()
      .then(() => {
        if (active) window.location.reload();
      })
      .catch((oauthError) => {
        if (active) setError(oauthError.message || String(oauthError));
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div role={error ? "alert" : "status"}>
        {error || status}
      </div>
    </main>
  );
}
