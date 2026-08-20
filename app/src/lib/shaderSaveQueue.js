/**
 * Serializes cloud saves per shader so concurrent save_shader_state RPCs
 * cannot pile up row locks on the same shaders row.
 */
export function createShaderSaveQueue() {
  /** @type {Map<string, Promise<unknown>>} */
  const tails = new Map();

  function isBusy(shaderId) {
    return Boolean(shaderId && tails.has(shaderId));
  }

  function enqueue(shaderId, task) {
    if (!shaderId) return task();

    const previous = tails.get(shaderId) ?? Promise.resolve();
    const next = previous.then(task, task).finally(() => {
      if (tails.get(shaderId) === next) tails.delete(shaderId);
    });
    tails.set(shaderId, next);
    return next;
  }

  return { enqueue, isBusy };
}

export const shaderSaveQueue = createShaderSaveQueue();
