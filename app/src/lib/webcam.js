function canRetryWithoutSavedDevice(error) {
  return (
    error?.name === "OverconstrainedError" ||
    error?.name === "NotFoundError"
  );
}

export async function acquireWebcamStream({
  deviceId = "",
  audio = false,
  mediaDevices = globalThis.navigator?.mediaDevices,
} = {}) {
  if (typeof mediaDevices?.getUserMedia !== "function") {
    throw new Error("Webcam is not available in this browser.");
  }

  if (deviceId) {
    try {
      return await mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio,
      });
    } catch (error) {
      if (!canRetryWithoutSavedDevice(error)) throw error;
    }
  }

  return mediaDevices.getUserMedia({ video: true, audio });
}
