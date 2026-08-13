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
 * @param {never} [_args]
 * @returns {never}
 */
export function createFigmaShader(_args) {
  throw new FigmaShadersError(
    "Push to Figma is not available yet. Figma has not shipped create for the custom shader library.",
    { code: "write_not_supported", status: 501 }
  );
}

/**
 * @param {never} [_args]
 * @returns {never}
 */
export function updateFigmaShader(_args) {
  throw new FigmaShadersError(
    "Push to Figma is not available yet. Figma has not shipped update for the custom shader library.",
    { code: "write_not_supported", status: 501 }
  );
}
