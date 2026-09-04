export const THUMBNAIL_SIZE = 512;
export const THUMBNAIL_SMALL_SIZE = 128;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not encode the thumbnail."));
      },
      type,
      quality,
    );
  });
}

export async function createThumbnailVariant(
  blob,
  {
    size = THUMBNAIL_SMALL_SIZE,
    createImageBitmap: createBitmap = globalThis.createImageBitmap,
    createCanvas = () => document.createElement("canvas"),
  } = {},
) {
  if (!(blob instanceof Blob)) {
    throw new TypeError("A thumbnail Blob is required.");
  }
  if (typeof createBitmap !== "function") {
    throw new Error("This browser cannot resize thumbnails.");
  }
  const bitmap = await createBitmap(blob);
  try {
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a thumbnail canvas.");
    context.drawImage(bitmap, 0, 0, size, size);
    return canvasToBlob(canvas, "image/webp", 0.82);
  } finally {
    bitmap.close?.();
  }
}
