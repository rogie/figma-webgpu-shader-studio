import { inferFeatures } from "./params.js";

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Export the current editor source as a shader-coder deliverable: main.ts plus
// a generated features.json (version 2, inferred isAnimated/usesMouse).
export function exportFigmaFiles(source, name) {
  const features = inferFeatures(source);
  const featuresJson = JSON.stringify(
    {
      name: name || "Shader",
      version: 2,
      isAnimated: features.isAnimated,
      usesMouse: features.usesMouse,
    },
    null,
    2
  );
  download("main.ts", source, "text/typescript");
  download("features.json", featuresJson + "\n", "application/json");
}
