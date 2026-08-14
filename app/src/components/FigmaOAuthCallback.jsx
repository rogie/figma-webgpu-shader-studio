import { useEffect, useState } from "react";
import { completeFigmaOAuthCallback } from "../services/figmaShaders.js";

export default function FigmaOAuthCallback() {
  const [error, setError] = useState("");

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
        {error || "Finishing your Figma connection…"}
      </div>
    </main>
  );
}
