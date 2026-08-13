import { getFigmaAccessToken } from "../lib/figmaAccessToken.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { buildFigmaShaderPackage } from "../runtime/exportFigma.js";
import {
  createFigmaShader,
  FigmaShadersError,
  updateFigmaShader,
} from "./figmaShadersWrite.js";

export {
  buildFigmaShaderPackage,
  createFigmaShader,
  FigmaShadersError,
  updateFigmaShader,
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** @typedef {"effect" | "fill"} FigmaShaderKind */

/**
 * @typedef {{ id: string, name: string, description?: string }} FigmaShaderSummary
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description?: string,
 *   type?: string,
 *   version?: string,
 *   kind: FigmaShaderKind,
 *   files: Array<{ filename: string, bytes?: number, uri?: string, text?: string }>,
 *   mainTs: string,
 *   featuresJson?: string,
 *   productBrief?: string,
 * }} FigmaShaderDetail
 */

function requireToken(explicitToken) {
  const token = (explicitToken ?? getFigmaAccessToken()).trim();
  if (!token) {
    throw new FigmaShadersError(
      "Add a Figma access token in Settings to use your Figma shader library.",
      { code: "missing_token" }
    );
  }
  return token;
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ token?: string, signal?: AbortSignal }} [options]
 */
async function callFigmaShaders(body, options = {}) {
  if (!isSupabaseConfigured) {
    throw new FigmaShadersError(
      "Supabase is not configured. Set VITE_SUPABASE_URL and publishable key.",
      { code: "not_configured" }
    );
  }

  const token = requireToken(options.token);
  const response = await fetch(`${supabaseUrl}/functions/v1/figma-shaders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "x-figma-token": token,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (typeof payload?.error === "string" && payload.error) ||
      `Figma shader request failed (${response.status})`;
    throw new FigmaShadersError(message, {
      code: typeof payload?.code === "string" ? payload.code : undefined,
      status: response.status,
    });
  }

  return payload || {};
}

/**
 * @param {FigmaShaderKind} kind
 * @param {{ cursor?: string, token?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<{ items: FigmaShaderSummary[], nextCursor: string | null }>}
 */
export async function listFigmaShaders(kind, options = {}) {
  if (kind !== "effect" && kind !== "fill") {
    throw new FigmaShadersError("kind must be effect or fill", {
      code: "invalid_kind",
    });
  }
  const payload = await callFigmaShaders(
    {
      op: "list",
      kind,
      cursor: options.cursor || undefined,
    },
    options
  );
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    nextCursor:
      typeof payload.nextCursor === "string" ? payload.nextCursor : null,
  };
}

/**
 * @param {FigmaShaderKind} kind
 * @param {string} id
 * @param {{ version?: string, token?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<FigmaShaderDetail>}
 */
export async function getFigmaShader(kind, id, options = {}) {
  if (kind !== "effect" && kind !== "fill") {
    throw new FigmaShadersError("kind must be effect or fill", {
      code: "invalid_kind",
    });
  }
  if (!id?.trim()) {
    throw new FigmaShadersError("Shader id is required", { code: "invalid_id" });
  }
  const payload = await callFigmaShaders(
    {
      op: "get",
      kind,
      id: id.trim(),
      version: options.version || undefined,
    },
    options
  );

  const files = Array.isArray(payload.files) ? payload.files : [];
  const byName = new Map(
    files.map((file) => [String(file.filename || "").toLowerCase(), file])
  );
  const main = byName.get("main.ts");
  const mainTs =
    (typeof payload.mainTs === "string" && payload.mainTs) ||
    (typeof main?.text === "string" && main.text) ||
    "";
  if (!mainTs.trim()) {
    throw new FigmaShadersError("Figma shader is missing main.ts source.", {
      code: "missing_main",
    });
  }

  return {
    id: String(payload.id || id),
    name: String(payload.name || "Shader"),
    description:
      typeof payload.description === "string" ? payload.description : "",
    type: typeof payload.type === "string" ? payload.type : kind,
    version: typeof payload.version === "string" ? payload.version : undefined,
    kind,
    files,
    mainTs,
    featuresJson:
      typeof payload.featuresJson === "string"
        ? payload.featuresJson
        : typeof byName.get("features.json")?.text === "string"
          ? byName.get("features.json").text
          : undefined,
    productBrief:
      typeof payload.productBrief === "string"
        ? payload.productBrief
        : typeof byName.get("product-brief.md")?.text === "string"
          ? byName.get("product-brief.md").text
          : undefined,
  };
}

/**
 * @param {{ token?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<{ ok: true, email?: string, handle?: string }>}
 */
export async function testFigmaConnection(options = {}) {
  const payload = await callFigmaShaders({ op: "test" }, options);
  return {
    ok: true,
    email: typeof payload.email === "string" ? payload.email : undefined,
    handle: typeof payload.handle === "string" ? payload.handle : undefined,
  };
}
