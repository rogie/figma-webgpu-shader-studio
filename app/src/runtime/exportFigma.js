import { inferFeatures } from "./params.js";

function download(filename, contents, mime) {
  const blob = new Blob([contents], { type: mime });
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
 * @param {{ supportsAudio?: boolean }} [extraFeatures]
 * @returns {{ mainTs: string, featuresJson: string, features: { name: string, version: number, isAnimated: boolean, usesMouse: boolean, supportsAudio?: boolean } }}
 */
export function buildFigmaShaderPackage(source, name, extraFeatures = {}) {
  const inferred = inferFeatures(source);
  const features = {
    version: 2,
    name: typeof name === "string" && name.trim() ? name.trim() : "Shader",
    isAnimated: inferred.isAnimated,
    usesMouse: inferred.usesMouse,
  };
  if (extraFeatures?.supportsAudio) features.supportsAudio = true;
  return {
    mainTs: source,
    featuresJson: `${JSON.stringify(features, null, 2)}\n`,
    features,
  };
}

function zipFilename(name) {
  const safeName = name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/[.\s]+$/g, "")
    .slice(0, 120);
  return `${safeName || "Shader"}.zip`;
}

/**
 * Build a ZIP containing the complete shader-coder deliverable.
 *
 * @param {string} source
 * @param {string} [name]
 * @returns {Promise<{ filename: string, bytes: Uint8Array }>}
 */
export async function buildFigmaShaderZip(source, name, extraFeatures = {}) {
  const { strToU8, zipSync } = await import("fflate");
  const { mainTs, featuresJson, features } = buildFigmaShaderPackage(
    source,
    name,
    extraFeatures
  );
  return {
    filename: zipFilename(features.name),
    bytes: zipSync(
      {
        "main.ts": strToU8(mainTs),
        "features.json": strToU8(featuresJson),
      },
      { level: 6 }
    ),
  };
}

// Export one shader-coder ZIP with main.ts and generated features.json.
export async function exportFigmaFiles(source, name, extraFeatures = {}) {
  const { filename, bytes } = await buildFigmaShaderZip(
    source,
    name,
    extraFeatures
  );
  download(filename, bytes, "application/zip");
}
