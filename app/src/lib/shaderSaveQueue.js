/**
 * Serializes cloud writes so concurrent save_shader_state /
 * restore_shader_version RPCs cannot pile up shaders row locks or exhaust
 * the PostgREST pool.
 */
export const SHADER_SAVE_LOCK_PREFIX = "figma-shader-studio:save:";

export function createShaderSaveQueue() {
  /** @type {Promise<unknown>} */
  let tail = Promise.resolve();
  let pending = 0;
  /** @type {Set<string>} */
  const busy = new Set();

  function isBusy(shaderId) {
    return Boolean(shaderId && busy.has(shaderId));
  }

  function isBusyAny() {
    return pending > 0;
  }

  function enqueue(shaderId, task) {
    const key = shaderId || "__create__";
    pending += 1;
    const run = async () => {
      busy.add(key);
      try {
        return await task();
      } finally {
        busy.delete(key);
      }
    };
    const next = tail.then(run, run);
    tail = next.then(
      () => {},
      () => {}
    );
    return next.finally(() => {
      pending -= 1;
    });
  }

  return { enqueue, isBusy, isBusyAny };
}

export async function withExclusiveShaderSave(
  shaderId,
  task,
  { ifAvailable = false, locks = globalThis.navigator?.locks } = {}
) {
  if (!shaderId || typeof locks?.request !== "function") {
    return { skipped: false, value: await task() };
  }

  const name = `${SHADER_SAVE_LOCK_PREFIX}${shaderId}`;
  if (ifAvailable) {
    let granted = false;
    const value = await locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) return undefined;
      granted = true;
      return task();
    });
    return granted
      ? { skipped: false, value }
      : { skipped: true, value: undefined };
  }

  return {
    skipped: false,
    value: await locks.request(name, () => task()),
  };
}

export const shaderSaveQueue = createShaderSaveQueue();
