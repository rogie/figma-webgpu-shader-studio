/** Max attachment payload for chat (keeps Edge Function body under limits). */
export const MAX_CHAT_ATTACHMENT_BYTES = 3 * 1024 * 1024;

export function providerSupportsChatVideo(provider) {
  return provider === "gemini";
}

export function providerSupportsChatImage(provider) {
  return provider === "openai" || provider === "anthropic" || provider === "gemini";
}

/**
 * @param {File} file
 * @param {"image"|"video"} kind
 * @returns {Promise<{
 *   kind: "image"|"video",
 *   name: string,
 *   mimeType: string,
 *   dataBase64: string,
 *   previewUrl: string,
 *   size: number,
 * }>}
 */
export async function fileToChatAttachment(file, kind) {
  if (!file) throw new Error("No file selected.");
  if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
    throw new Error(
      `Attachment must be under ${Math.round(MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024))} MB.`
    );
  }

  const mimeType = file.type || (kind === "video" ? "video/mp4" : "image/png");
  if (kind === "image" && !mimeType.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (kind === "video" && !mimeType.startsWith("video/")) {
    throw new Error("Please choose a video file.");
  }

  const dataUrl = await readFileAsDataUrl(file);
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Could not read file.");
  const dataBase64 = dataUrl.slice(comma + 1);

  return {
    kind,
    name: file.name || (kind === "video" ? "video" : "image"),
    mimeType,
    dataBase64,
    previewUrl: dataUrl,
    size: file.size,
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

/** Payload shape sent to the chat proxy (no preview URL). */
export function attachmentForApi(attachment) {
  if (!attachment) return null;
  return {
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
    dataBase64: attachment.dataBase64,
  };
}

/** Persistable metadata only (no base64). */
export function attachmentMeta(attachment) {
  if (!attachment) return undefined;
  return {
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
  };
}
