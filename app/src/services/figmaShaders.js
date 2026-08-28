import {
  clearFigmaAccessToken,
  getFigmaAccessToken,
  getFigmaOAuthSession,
  setFigmaOAuthSession,
} from "../lib/figmaAccessToken.js";
import { isSupabaseConfigured, supabase } from "../lib/supabase.js";
import { buildFigmaShaderPackage } from "../runtime/exportFigma.js";
import {
  createFigmaShader as createFigmaShaderRequest,
  FigmaShadersError,
  updateFigmaShader as updateFigmaShaderRequest,
} from "./figmaShadersWrite.js";

export {
  buildFigmaShaderPackage,
  FigmaShadersError,
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const OAUTH_CALLBACK_PATH = "figma/oauth/callback";
const OAUTH_PENDING_KEY = "shader-studio.figmaOAuthPending";
let refreshPromise = null;
let callbackPromise = null;

/** @typedef {"effect" | "fill"} FigmaShaderKind */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description?: string,
 *   type: FigmaShaderKind,
 *   kind: FigmaShaderKind,
 *   owner?: string,
 * }} FigmaShaderSummary
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description?: string,
 *   owner?: string,
 *   type?: string,
 *   version?: string,
 *   kind: FigmaShaderKind,
 *   files: Array<{ filename: string, bytes?: number, uri?: string, text?: string }>,
 *   mainTs: string,
 *   featuresJson?: string,
 *   features?: { name?: string, version?: number, isAnimated?: boolean, usesMouse?: boolean },
 *   productBrief?: string,
 * }} FigmaShaderDetail
 */

function callbackUrl() {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  return new URL(OAUTH_CALLBACK_PATH, base).toString();
}

function randomBase64Url(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  let binary = "";
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ token?: string, signal?: AbortSignal }} [options]
 */
async function callFigmaShadersRaw(body, options = {}) {
  if (!isSupabaseConfigured) {
    throw new FigmaShadersError(
      "Supabase is not configured. Set VITE_SUPABASE_URL and publishable key.",
      { code: "not_configured" }
    );
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/figma-shaders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      ...(options.token ? { "x-figma-token": options.token } : {}),
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
    const details =
      payload?.details &&
      typeof payload.details === "object" &&
      !Array.isArray(payload.details)
        ? payload.details
        : undefined;
    console.error("Figma shader request failed", {
      operation: typeof body?.op === "string" ? body.op : "unknown",
      status: response.status,
      code: typeof payload?.code === "string" ? payload.code : undefined,
      message,
      details,
    });
    throw new FigmaShadersError(message, {
      code: typeof payload?.code === "string" ? payload.code : undefined,
      status: response.status,
      details,
    });
  }

  return payload || {};
}

async function refreshFigmaAccessToken(signal) {
  const session = getFigmaOAuthSession();
  if (!session?.refreshToken) {
    clearFigmaAccessToken();
    throw new FigmaShadersError("Reconnect Figma to continue.", {
      code: "figma_reconnect_required",
    });
  }
  if (!refreshPromise) {
    refreshPromise = callFigmaShadersRaw(
      { op: "oauth-refresh", refreshToken: session.refreshToken },
      { signal }
    )
      .then((payload) => {
        setFigmaOAuthSession({
          accessToken: payload.accessToken,
          refreshToken: payload.refreshToken,
          expiresIn: payload.expiresIn,
          userId: payload.userId,
        });
        return getFigmaAccessToken();
      })
      .catch((error) => {
        clearFigmaAccessToken();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function requireToken(explicitToken, signal) {
  if (typeof explicitToken === "string" && explicitToken.trim()) {
    return explicitToken.trim();
  }
  const session = getFigmaOAuthSession();
  if (!session?.accessToken) {
    throw new FigmaShadersError(
      "Connect Figma in Settings to use your shader library.",
      { code: "missing_token" }
    );
  }
  if (session.expiresAt && session.expiresAt <= Date.now() + 60_000) {
    return refreshFigmaAccessToken(signal);
  }
  return session.accessToken;
}

async function callFigmaShaders(body, options = {}) {
  const token = await requireToken(options.token, options.signal);
  try {
    return await callFigmaShadersRaw(body, { ...options, token });
  } catch (error) {
    if (
      options.token ||
      error?.status !== 401 ||
      !getFigmaOAuthSession()?.refreshToken
    ) {
      throw error;
    }
    const refreshedToken = await refreshFigmaAccessToken(options.signal);
    return callFigmaShadersRaw(body, { ...options, token: refreshedToken });
  }
}

export function isFigmaOAuthCallback() {
  try {
    return window.location.pathname === new URL(callbackUrl()).pathname;
  } catch {
    return false;
  }
}

async function establishFigmaStudioSession(auth) {
  if (!supabase) {
    throw new FigmaShadersError(
      "Supabase is not configured, so Figma sign-in cannot start a session.",
      { code: "figma_session_missing" }
    );
  }
  const accessToken =
    typeof auth?.accessToken === "string" ? auth.accessToken : "";
  const refreshToken =
    typeof auth?.refreshToken === "string" ? auth.refreshToken : "";
  if (!accessToken || !refreshToken) {
    throw new FigmaShadersError(
      "Figma connected, but Shader Studio did not return a session. Deploy the updated figma-shaders function and try again.",
      { code: "figma_session_missing" }
    );
  }
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    throw new FigmaShadersError(
      error.message || "Could not finish Figma sign-in.",
      { code: "figma_session_verify_failed" }
    );
  }
}

export function peekFigmaOAuthIntent() {
  try {
    const pending = JSON.parse(sessionStorage.getItem(OAUTH_PENDING_KEY) || "null");
    return pending?.intent === "signin" ? "signin" : "connect";
  } catch {
    return "connect";
  }
}

/**
 * @param {{ intent?: "signin" | "connect" }} [options]
 */
export async function beginFigmaOAuth(options = {}) {
  const intent = options.intent === "signin" ? "signin" : "connect";
  const state = randomBase64Url();
  const verifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(verifier);
  sessionStorage.setItem(
    OAUTH_PENDING_KEY,
    JSON.stringify({
      state,
      verifier,
      intent,
      returnUrl:
        window.location.pathname + window.location.search + window.location.hash,
    })
  );
  const payload = await callFigmaShadersRaw({
    op: "oauth-authorize",
    redirectUri: callbackUrl(),
    state,
    codeChallenge,
    intent,
  });
  if (typeof payload.authorizationUrl !== "string") {
    throw new FigmaShadersError("Figma authorization URL was not returned.", {
      code: "oauth_authorize_failed",
    });
  }
  window.location.assign(payload.authorizationUrl);
}

async function exchangeFigmaOAuthCallback() {
  if (!isFigmaOAuthCallback()) return null;
  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get("error");
  if (oauthError) {
    throw new FigmaShadersError(
      params.get("error_description") || `Figma authorization failed: ${oauthError}`,
      { code: oauthError }
    );
  }
  const code = params.get("code");
  const state = params.get("state");
  let pending = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(OAUTH_PENDING_KEY) || "null");
  } catch {
    pending = null;
  }
  if (!code || !state || !pending?.verifier || state !== pending.state) {
    throw new FigmaShadersError(
      "Figma authorization state could not be verified. Please connect again.",
      { code: "oauth_state_mismatch" }
    );
  }

  try {
    const intent = pending.intent === "signin" ? "signin" : "connect";
    const payload = await callFigmaShadersRaw({
      op: "oauth-exchange",
      code,
      codeVerifier: pending.verifier,
      redirectUri: callbackUrl(),
      intent,
    });
    if (intent === "signin") {
      await establishFigmaStudioSession(payload.auth);
    } else {
      setFigmaOAuthSession({
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        expiresIn: payload.expiresIn,
        userId: payload.userId,
      });
    }
    payload.intent = intent;
    const basePath = new URL(import.meta.env.BASE_URL, window.location.origin)
      .pathname;
    const returnUrl =
      typeof pending.returnUrl === "string" &&
      pending.returnUrl.startsWith(basePath) &&
      !pending.returnUrl.startsWith(new URL(callbackUrl()).pathname)
        ? pending.returnUrl
        : basePath;
    window.history.replaceState({}, "", returnUrl);
    return payload;
  } finally {
    sessionStorage.removeItem(OAUTH_PENDING_KEY);
  }
}

export function completeFigmaOAuthCallback() {
  if (!isFigmaOAuthCallback()) return Promise.resolve(null);
  if (!callbackPromise) {
    callbackPromise = exchangeFigmaOAuthCallback();
  }
  return callbackPromise;
}

export function disconnectFigma() {
  clearFigmaAccessToken();
}

/**
 * @param {FigmaShaderKind | { cursor?: string, token?: string, signal?: AbortSignal }} [kindOrOptions]
 * @param {{ cursor?: string, token?: string, signal?: AbortSignal }} [maybeOptions]
 * @returns {Promise<{ items: FigmaShaderSummary[], nextCursor: string | null }>}
 */
export async function listFigmaShaders(kindOrOptions = {}, maybeOptions = {}) {
  const kind =
    kindOrOptions === "effect" || kindOrOptions === "fill"
      ? kindOrOptions
      : undefined;
  const options = kind ? maybeOptions : kindOrOptions || {};
  const payload = await callFigmaShaders(
    {
      op: "list",
      kind,
      cursor: options.cursor || undefined,
    },
    options
  );
  const items = (Array.isArray(payload.items) ? payload.items : [])
    .map((item) => {
      const type =
        item?.type === "fill" || item?.kind === "fill"
          ? "fill"
          : item?.type === "effect" || item?.kind === "effect"
            ? "effect"
            : undefined;
      if (!type || (kind && type !== kind)) return null;
      return {
        id: String(item?.id || ""),
        name: String(item?.name || "Untitled"),
        description:
          typeof item?.description === "string" ? item.description : "",
        type,
        kind: type,
        owner: typeof item?.owner === "string" ? item.owner : undefined,
      };
    })
    .filter((item) => item?.id);
  return {
    items,
    nextCursor:
      typeof payload.nextCursor === "string" ? payload.nextCursor : null,
  };
}

/**
 * Load every page in a shader library.
 * @param {FigmaShaderKind | { token?: string, signal?: AbortSignal }} [kindOrOptions]
 * @param {{ token?: string, signal?: AbortSignal }} [maybeOptions]
 * @returns {Promise<FigmaShaderSummary[]>}
 */
export async function listAllFigmaShaders(kindOrOptions = {}, maybeOptions = {}) {
  const kind =
    kindOrOptions === "effect" || kindOrOptions === "fill"
      ? kindOrOptions
      : undefined;
  const options = kind ? maybeOptions : kindOrOptions || {};
  const items = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let cursor;
  do {
    const page = kind
      ? await listFigmaShaders(kind, { ...options, cursor })
      : await listFigmaShaders({ ...options, cursor });
    for (const item of page.items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        items.push(item);
      }
    }
    cursor = page.nextCursor || undefined;
    if (cursor && seenCursors.has(cursor)) break;
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return items;
}

/**
 * @param {FigmaShaderKind | string} kindOrId
 * @param {string | { version?: string, token?: string, signal?: AbortSignal }} [idOrOptions]
 * @param {{ version?: string, token?: string, signal?: AbortSignal }} [maybeOptions]
 * @returns {Promise<FigmaShaderDetail>}
 */
export async function getFigmaShader(
  kindOrId,
  idOrOptions = {},
  maybeOptions = {}
) {
  const legacyCall =
    (kindOrId === "effect" || kindOrId === "fill") &&
    typeof idOrOptions === "string";
  const kind = legacyCall ? kindOrId : undefined;
  const id = legacyCall ? idOrOptions : kindOrId;
  const options = legacyCall ? maybeOptions : idOrOptions || {};
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
  const featuresJson =
    typeof payload.featuresJson === "string"
      ? payload.featuresJson
      : typeof byName.get("features.json")?.text === "string"
        ? byName.get("features.json").text
        : undefined;
  let features;
  if (featuresJson) {
    try {
      const parsed = JSON.parse(featuresJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        features = parsed;
      }
    } catch {
      features = undefined;
    }
  }
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
    owner: typeof payload.owner === "string" ? payload.owner : undefined,
    type: typeof payload.type === "string" ? payload.type : kind,
    version: typeof payload.version === "string" ? payload.version : undefined,
    kind:
      payload.type === "fill" || payload.kind === "fill"
        ? "fill"
        : payload.type === "effect" || payload.kind === "effect"
          ? "effect"
          : kind || "effect",
    files,
    mainTs,
    featuresJson,
    features,
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

/**
 * @param {{ token?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<Array<{ key: string, name: string, tier: string, seat: string }>>}
 */
export async function listFigmaPlans(options = {}) {
  const payload = await callFigmaShaders({ op: "plans" }, options);
  const plans = Array.isArray(payload.plans) ? payload.plans : [];
  return plans
    .map((plan) => ({
      key: typeof plan?.key === "string" ? plan.key : "",
      name:
        typeof plan?.name === "string" && plan.name.trim()
          ? plan.name.trim()
          : "Figma plan",
      tier: typeof plan?.tier === "string" ? plan.tier : "",
      seat: typeof plan?.seat === "string" ? plan.seat : "",
    }))
    .filter(
      (plan) =>
        /^(team|organization)::\d+$/.test(plan.key) &&
        plan.seat.toLowerCase() !== "view"
    );
}

/**
 * @param {{ name: string, description: string, planKey: string, kind: FigmaShaderKind }} args
 * @param {{ token?: string, signal?: AbortSignal }} [options]
 */
export function createFigmaShader(args, options = {}) {
  return createFigmaShaderRequest(callFigmaShaders, args, options);
}

/**
 * @param {{
 *   id: string,
 *   kind: FigmaShaderKind,
 *   mainTs: string,
 *   metadata?: { name?: string, description?: string, isAnimated?: boolean, usesMouse?: boolean },
 *   commitMessage: string,
 * }} args
 * @param {{ token?: string, signal?: AbortSignal }} [options]
 */
export function updateFigmaShader(args, options = {}) {
  return updateFigmaShaderRequest(callFigmaShaders, args, options);
}
