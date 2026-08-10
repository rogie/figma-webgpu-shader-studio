const enabled =
  typeof import.meta !== "undefined" &&
  Boolean(import.meta.env?.DEV) &&
  typeof performance !== "undefined";

const metrics = new Map();

function entry(name) {
  let value = metrics.get(name);
  if (!value) {
    value = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
    metrics.set(name, value);
  }
  return value;
}

export function recordPerf(name, durationMs = 0) {
  if (!enabled) return;
  const value = entry(name);
  value.count += 1;
  value.lastMs = durationMs;
  value.totalMs += durationMs;
  value.maxMs = Math.max(value.maxMs, durationMs);
}

export function measurePerf(name, startTime) {
  if (!enabled) return;
  recordPerf(name, performance.now() - startTime);
}

export function perfNow() {
  return enabled ? performance.now() : 0;
}

export function getPerfSnapshot() {
  return Object.fromEntries(
    [...metrics].map(([name, value]) => [
      name,
      {
        ...value,
        averageMs: value.count ? value.totalMs / value.count : 0,
      },
    ])
  );
}

if (enabled && typeof window !== "undefined") {
  window.__shaderStudioPerf = {
    snapshot: getPerfSnapshot,
    reset() {
      metrics.clear();
    },
  };
}
