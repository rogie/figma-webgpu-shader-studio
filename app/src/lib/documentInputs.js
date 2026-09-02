export const MAX_DOCUMENT_INPUTS = 8;
export const INPUT_TYPES = ["audio", "microphone"];
export const DEFAULT_AUDIO_GAIN = 1;
export const MAX_AUDIO_GAIN = 2;

export function normalizeAudioGain(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return DEFAULT_AUDIO_GAIN;
  if (next <= 0) return 0;
  if (next >= MAX_AUDIO_GAIN) return MAX_AUDIO_GAIN;
  return next;
}

export function audioPlaybackSettings(audio) {
  const payload = isRecord(audio) ? audio : {};
  return {
    gain:
      payload.gain === undefined || payload.gain === null
        ? DEFAULT_AUDIO_GAIN
        : normalizeAudioGain(payload.gain),
    monitor: payload.monitor !== false,
    loop: payload.loop !== false,
  };
}

export function audioInputHasFile(input) {
  if (input?.type !== "audio") return false;
  const audio = input.audio || {};
  return Boolean(audio.url || audio.assetPath || audio.name);
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

export function isDocumentInputType(type) {
  return INPUT_TYPES.includes(type);
}

export function emptyAudioInput() {
  return {
    id: crypto.randomUUID(),
    type: "audio",
    enabled: true,
    audio: { url: "", name: "" },
  };
}

export function emptyMicrophoneInput() {
  return {
    id: crypto.randomUUID(),
    type: "microphone",
    enabled: true,
  };
}

export function createDocumentInput(type) {
  if (type === "microphone") return emptyMicrophoneInput();
  return emptyAudioInput();
}

function normalizeAudioPayload(audio) {
  const payload = isRecord(audio) ? audio : {};
  const url = stringOrEmpty(payload.url);
  const name = stringOrEmpty(payload.name);
  const assetPath = stringOrEmpty(payload.assetPath);
  const localAssetKey = stringOrEmpty(payload.localAssetKey);
  const playback = audioPlaybackSettings(payload);
  return {
    url,
    name,
    gain: playback.gain,
    monitor: playback.monitor,
    loop: playback.loop,
    ...(assetPath ? { assetPath } : {}),
    ...(localAssetKey ? { localAssetKey } : {}),
  };
}

export function normalizeDocumentInput(input, fallbackId = null) {
  const candidate = isRecord(input) ? input : {};
  if (!isDocumentInputType(candidate.type)) return null;
  const type = candidate.type;
  const id =
    typeof candidate.id === "string" && candidate.id
      ? candidate.id
      : fallbackId || crypto.randomUUID();
  const enabled = candidate.enabled !== false;
  if (type === "microphone") {
    return { id, type, enabled };
  }
  return {
    id,
    type: "audio",
    enabled,
    audio: normalizeAudioPayload(candidate.audio),
  };
}

export function normalizeDocumentInputs(inputs) {
  const seen = new Set();
  return (Array.isArray(inputs) ? inputs : [])
    .slice(0, MAX_DOCUMENT_INPUTS)
    .map((input) => {
      let normalized = normalizeDocumentInput(input);
      if (!normalized) return null;
      while (seen.has(normalized.id)) {
        normalized = { ...normalized, id: crypto.randomUUID() };
      }
      seen.add(normalized.id);
      return normalized;
    })
    .filter(Boolean);
}

export function readDocumentInputs(value) {
  if (Array.isArray(value)) return normalizeDocumentInputs(value);
  if (isRecord(value) && Array.isArray(value.inputs)) {
    return normalizeDocumentInputs(value.inputs);
  }
  if (isRecord(value) && Array.isArray(value.composition?.inputs)) {
    return normalizeDocumentInputs(value.composition.inputs);
  }
  return [];
}

function isEphemeralUrl(url) {
  return (
    typeof url === "string" &&
    (url.startsWith("blob:") || url.startsWith("data:"))
  );
}

export function persistableDocumentInputs(inputs) {
  return normalizeDocumentInputs(inputs).map((input) => {
    if (input.type !== "audio") return input;
    const { localAssetKey: _localAssetKey, ...audio } = input.audio;
    return {
      ...input,
      audio: {
        name: audio.name,
        url: isEphemeralUrl(audio.url) ? "" : audio.url,
        ...(audio.assetPath ? { assetPath: audio.assetPath } : {}),
        ...(audio.gain !== DEFAULT_AUDIO_GAIN ? { gain: audio.gain } : {}),
        ...(audio.monitor === false ? { monitor: false } : {}),
        ...(audio.loop === false ? { loop: false } : {}),
      },
    };
  });
}

export function hasAudioInput(inputs) {
  return normalizeDocumentInputs(inputs).some(
    (input) =>
      input.enabled &&
      (input.type === "microphone" ||
        (input.type === "audio" &&
          (input.audio.url || input.audio.assetPath))),
  );
}

export function enabledAudioFileInput(inputs) {
  return (
    normalizeDocumentInputs(inputs).find(
      (input) => input.enabled && input.type === "audio" && input.audio.url,
    ) || null
  );
}

export function enabledMicrophoneInput(inputs) {
  return (
    normalizeDocumentInputs(inputs).find(
      (input) => input.enabled && input.type === "microphone",
    ) || null
  );
}

export function removedDocumentInputs(previous, next) {
  const nextIds = new Set(
    normalizeDocumentInputs(next).map((input) => input.id),
  );
  return normalizeDocumentInputs(previous).filter(
    (input) => !nextIds.has(input.id),
  );
}

export function inputTypeLabel(type) {
  if (type === "microphone") return "Microphone";
  return "Audio";
}
