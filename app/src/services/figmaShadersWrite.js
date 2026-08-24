export class FigmaShadersError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, status?: number }} [extra]
   */
  constructor(message, extra = {}) {
    super(message);
    this.name = "FigmaShadersError";
    this.code = extra.code;
    this.status = extra.status;
  }
}

/**
 * @param {unknown} value
 * @param {string} field
 */
function requiredString(value, field) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new FigmaShadersError(`${field} is required`, {
      code: `invalid_${field}`,
      status: 400,
    });
  }
  return text;
}

function requiredSource(value) {
  const source = typeof value === "string" ? value : "";
  if (!source.trim()) {
    throw new FigmaShadersError("mainTs is required", {
      code: "invalid_main_ts",
      status: 400,
    });
  }
  return source;
}

/**
 * @param {unknown} value
 */
function requiredKind(value) {
  if (value !== "effect" && value !== "fill") {
    throw new FigmaShadersError("kind must be effect or fill", {
      code: "invalid_kind",
      status: 400,
    });
  }
  return value;
}

/**
 * @param {unknown} payload
 */
function shaderResult(payload) {
  const result = payload && typeof payload === "object" ? payload : {};
  const id = typeof result.id === "string" ? result.id.trim() : "";
  if (!id) {
    throw new FigmaShadersError("Figma did not return a shader id.", {
      code: "missing_shader_id",
      status: 502,
    });
  }
  return {
    id,
    kind: requiredKind(result.kind),
    version:
      typeof result.version === "string" && result.version.trim()
        ? result.version.trim()
        : null,
  };
}

/**
 * @param {(body: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>} request
 * @param {{ name: string, description: string, planKey: string, kind: "effect" | "fill" }} args
 * @param {{ token?: string, signal?: AbortSignal }} [options]
 */
export async function createFigmaShader(request, args, options = {}) {
  if (typeof request !== "function") {
    throw new FigmaShadersError("Figma shader request client is unavailable.", {
      code: "not_configured",
    });
  }
  const kind = requiredKind(args?.kind);
  const planKey = requiredString(args?.planKey, "planKey");
  if (!/^(team|organization)::\d+$/.test(planKey)) {
    throw new FigmaShadersError(
      "planKey must be a Figma team or organization key",
      { code: "invalid_plan_key", status: 400 }
    );
  }
  const payload = await request(
    {
      op: "create",
      name: requiredString(args?.name, "name"),
      description: requiredString(args?.description, "description"),
      planKey,
      kind,
    },
    options
  );
  return shaderResult(payload);
}

/**
 * @param {(body: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>} request
 * @param {{ id: string, kind: "effect" | "fill", mainTs: string, commitMessage: string }} args
 * @param {{ token?: string, signal?: AbortSignal }} [options]
 */
export async function updateFigmaShader(request, args, options = {}) {
  if (typeof request !== "function") {
    throw new FigmaShadersError("Figma shader request client is unavailable.", {
      code: "not_configured",
    });
  }
  const payload = await request(
    {
      op: "update",
      id: requiredString(args?.id, "id"),
      kind: requiredKind(args?.kind),
      mainTs: requiredSource(args?.mainTs),
      commitMessage: requiredString(args?.commitMessage, "commitMessage"),
    },
    options
  );
  return shaderResult(payload);
}
