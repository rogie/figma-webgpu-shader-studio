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

/**
 * Build the Figma shader-coder package (main.ts + features.json).
 * Shared by download export and future Push to Figma.
 *
 * @param {string} source
 * @param {string} [name]
 * @returns {{ mainTs: string, featuresJson: string, features: { name: string, version: number, isAnimated: boolean, usesMouse: boolean } }}
 */
export function buildFigmaShaderPackage(source, name) {
  const inferred = inferFeatures(source);
  const features = {
    name: name || "Shader",
    version: 2,
    isAnimated: inferred.isAnimated,
    usesMouse: inferred.usesMouse,
  };
  return {
    mainTs: source,
    featuresJson: `${JSON.stringify(features, null, 2)}\n`,
    features,
  };
}

// Export the current editor source as a shader-coder deliverable: main.ts plus
// a generated features.json (version 2, inferred isAnimated/usesMouse).
export function exportFigmaFiles(source, name) {
  const { mainTs, featuresJson } = buildFigmaShaderPackage(source, name);
  download("main.ts", mainTs, "text/typescript");
  download("features.json", featuresJson, "application/json");
}
