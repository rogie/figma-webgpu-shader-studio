export function dataUrlToObjectUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mime = /data:(.*?);/.exec(header)?.[1] || "application/octet-stream";
  let bytes;
  if (header.includes(";base64")) {
    const binary = atob(data);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(data));
  }
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

export function revokeObjectUrl(url) {
  if (typeof url === "string" && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export async function fileFromBlobUrl(url, fileName) {
  if (typeof url !== "string" || !url.startsWith("blob:")) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const type = blob.type || "application/octet-stream";
    const name =
      fileName ||
      (type === "image/svg+xml"
        ? "input.svg"
        : type.startsWith("video/")
          ? "input.mp4"
          : "input.png");
    return new File([blob], name, { type });
  } catch {
    return null;
  }
}

export function mediaType(file) {
  if (file.type?.startsWith("image/") || file.type?.startsWith("video/")) {
    return file.type;
  }
  const extension = file.name?.split(".").pop()?.toLowerCase();
  return {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
  }[extension];
}
