export function videoExportFramePlan(duration, frameRate) {
  const seconds = Math.max(0, Number(duration) || 0);
  const fps = Math.max(1, Number(frameRate) || 1);
  const frameCount = Math.max(1, Math.round(seconds * fps));
  const frameDurationMs = 1000 / fps;
  return Array.from({ length: frameCount }, (_, frame) => ({
    frame,
    timeMs: frame * frameDurationMs,
    deltaMs: frameDurationMs,
    timeSec: frame / fps,
    durationSec: 1 / fps,
  }));
}
