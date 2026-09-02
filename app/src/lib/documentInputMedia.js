import {
  createDraftMediaObjectUrl,
  draftMediaAssetKey,
  parseDraftMediaAssetKey,
} from "./draftMediaStorage.js";
import { fileFromBlobUrl } from "./mediaFiles.js";
import {
  normalizeDocumentInputs,
  persistableDocumentInputs,
} from "./documentInputs.js";

export function audioInputRoleId(inputId) {
  const safe = String(inputId || "audio").replace(/[^a-zA-Z0-9_-]/g, "-");
  return `audio-${safe || "audio"}`;
}

export function documentAudioAssetPaths(inputs) {
  return [
    ...new Set(
      normalizeDocumentInputs(inputs)
        .map((input) =>
          input.type === "audio" ? input.audio?.assetPath || "" : "",
        )
        .filter(Boolean),
    ),
  ];
}

export function withAudioInputUrl(input, url) {
  if (input?.type !== "audio" || !url) return input;
  return {
    ...input,
    audio: { ...input.audio, url },
  };
}

export function withAudioInputAssetPath(input, assetPath, fileName = "") {
  if (input?.type !== "audio" || !assetPath) return input;
  const { localAssetKey: _localAssetKey, url, ...audio } = input.audio || {};
  return {
    ...input,
    audio: {
      ...audio,
      name: fileName || audio.name || "",
      assetPath,
      url: typeof url === "string" && !url.startsWith("blob:") && !url.startsWith("data:")
        ? url
        : "",
    },
  };
}

export function hasDraftAudioMedia(inputs) {
  return normalizeDocumentInputs(inputs).some((input) => {
    if (input.type !== "audio") return false;
    const url = input.audio?.url;
    return Boolean(
      input.audio?.localAssetKey ||
        input.audio?.assetPath ||
        (typeof url === "string" &&
          (url.startsWith("blob:") || url.startsWith("data:"))),
    );
  });
}

export async function persistDraftAudioInputs(
  draftId,
  inputs,
  mediaStore,
  { fileFromUrl = fileFromBlobUrl, downloadAsset = null } = {},
) {
  const normalized = normalizeDocumentInputs(inputs);
  const next = [];
  for (const input of normalized) {
    if (input.type !== "audio") {
      next.push(input);
      continue;
    }
    const roleId = audioInputRoleId(input.id);
    const audio = input.audio || {};
    const url = audio.url;
    let file = await fileFromUrl(url, audio.name);
    const existing =
      parseDraftMediaAssetKey(audio.localAssetKey) || url || audio.assetPath
        ? await mediaStore?.get?.(draftId, roleId)
        : null;
    if (!file && !existing && audio.assetPath && typeof downloadAsset === "function") {
      try {
        const blob = await downloadAsset(audio.assetPath);
        const fileName =
          audio.name ||
          String(audio.assetPath).split("/").pop() ||
          "input.mp3";
        file = new File([blob], fileName, {
          type: blob.type || "audio/mpeg",
        });
      } catch {
        file = null;
      }
    }
    if (file && typeof mediaStore?.put === "function") {
      await mediaStore.put({
        draftId,
        roleId,
        blob: file,
        fileName: file.name,
        lastModified: file.lastModified,
      });
    }
    if (file || existing) {
      next.push({
        ...input,
        audio: {
          ...input.audio,
          localAssetKey: draftMediaAssetKey(draftId, roleId),
        },
      });
      continue;
    }
    next.push(input);
  }
  return next;
}

export async function uploadDocumentInputAudio({
  inputs,
  ownerId,
  shaderId,
  copyDurableAssets = false,
  fileFromUrl = fileFromBlobUrl,
  downloadAsset = null,
  uploadAsset,
  mediaType: detectType = (file) => file?.type,
  maxBytes = 0,
} = {}) {
  const normalized = normalizeDocumentInputs(inputs);
  const next = [];
  for (const input of normalized) {
    if (input.type !== "audio") {
      next.push(input);
      continue;
    }
    const audio = input.audio || {};
    let file = await fileFromUrl(audio.url, audio.name);
    if (!file && copyDurableAssets && audio.assetPath && typeof downloadAsset === "function") {
      try {
        const blob = await downloadAsset(audio.assetPath);
        const fileName =
          audio.name ||
          String(audio.assetPath).split("/").pop() ||
          "input.mp3";
        file = new File([blob], fileName, {
          type: blob.type || "audio/mpeg",
        });
      } catch {
        file = null;
      }
    }
    if (!file) {
      next.push(input);
      continue;
    }
    if (maxBytes && file.size > maxBytes) {
      throw new Error("Input media must be 25 MB or smaller.");
    }
    if (typeof uploadAsset !== "function") {
      throw new Error("Audio upload is unavailable.");
    }
    const contentType = detectType(file) || file.type;
    const assetPath = await uploadAsset({
      ownerId,
      shaderId,
      role: audioInputRoleId(input.id),
      blob: file,
      fileName: file.name,
      contentType,
    });
    next.push(withAudioInputAssetPath(input, assetPath, file.name));
  }
  return persistableDocumentInputs(next);
}

export async function hydrateDraftAudioInputs(
  draftId,
  inputs,
  mediaStore,
  { urlApi = globalThis.URL } = {},
) {
  const normalized = normalizeDocumentInputs(inputs);
  if (typeof mediaStore?.get !== "function") return normalized;
  const next = [];
  for (const input of normalized) {
    if (input.type !== "audio") {
      next.push(input);
      continue;
    }
    const roleId = audioInputRoleId(input.id);
    try {
      const record = await mediaStore.get(draftId, roleId);
      const url = createDraftMediaObjectUrl(record, urlApi);
      next.push(url ? withAudioInputUrl(input, url) : input);
    } catch {
      next.push(input);
    }
  }
  return next;
}

export function hydrateAudioInputsWithUrls(inputs, urlsByPath) {
  return normalizeDocumentInputs(inputs).map((input) => {
    if (input.type !== "audio") return input;
    const path = input.audio?.assetPath;
    const url = path ? urlsByPath?.[path] : "";
    return url ? withAudioInputUrl(input, url) : input;
  });
}
