export function calculateFrameRate(previousFrame, currentFrame, elapsedMs) {
  const frameDelta = Number(currentFrame) - Number(previousFrame);
  if (
    !Number.isFinite(frameDelta) ||
    frameDelta < 0 ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs <= 0
  ) {
    return 0;
  }
  return Math.round((frameDelta * 1000) / elapsedMs);
}
