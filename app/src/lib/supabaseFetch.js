export const SUPABASE_REQUEST_TIMEOUT_MS = 30_000;

export class SupabaseRequestTimeoutError extends Error {
  constructor(context = "request") {
    super(
      `The server took too long to respond ${context}. Try again in a moment. If this keeps happening, cloud saves may be temporarily stuck.`
    );
    this.name = "SupabaseRequestTimeoutError";
  }
}

function requestContext(input) {
  const url = typeof input === "string" ? input : input?.url || "";
  if (url.includes("/rest/v1/rpc/save_shader_state")) {
    return "while saving your shader";
  }
  if (url.includes("/rest/v1/rpc/restore_shader_version")) {
    return "while restoring a version";
  }
  if (url.includes("/rest/v1/shaders")) {
    return "while loading shaders";
  }
  if (url.includes("/storage/v1/")) {
    return "while syncing shader assets";
  }
  return "while talking to the server";
}

export function createSupabaseFetch(timeoutMs = SUPABASE_REQUEST_TIMEOUT_MS) {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(
      () => controller.abort(),
      timeoutMs
    );

    const externalSignal = init.signal;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else {
        externalSignal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }
    }

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new SupabaseRequestTimeoutError(requestContext(input));
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  };
}

const LOCK_TIMEOUT_RE =
  /lock_not_available|canceling statement due to lock timeout/i;

export function isTransientCloudWriteError(error) {
  if (error instanceof SupabaseRequestTimeoutError) return true;
  if (error?.name === "AbortError") return true;
  const message = error?.message || String(error || "");
  return LOCK_TIMEOUT_RE.test(message) || /took too long to respond/i.test(message);
}

export function formatSupabaseError(error, fallback = "Cloud request failed.") {
  if (error instanceof SupabaseRequestTimeoutError) return error.message;
  if (error?.name === "AbortError") {
    return new SupabaseRequestTimeoutError().message;
  }
  const message = error?.message || String(error || "");
  if (LOCK_TIMEOUT_RE.test(message)) {
    return "Could not save right now because another save is still finishing. Wait a moment and try again.";
  }
  if (/fetch failed|networkerror|failed to fetch/i.test(message)) {
    return "Could not reach the server. Check your connection and try again.";
  }
  return message || fallback;
}
