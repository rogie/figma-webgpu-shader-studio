import assert from "node:assert/strict";
import test from "node:test";
import {
  createThumbnailVariant,
  THUMBNAIL_SIZE,
  THUMBNAIL_SMALL_SIZE,
} from "./thumbnailVariants.js";

test("thumbnail sizes keep card and rail variants distinct", () => {
  assert.equal(THUMBNAIL_SIZE, 512);
  assert.equal(THUMBNAIL_SMALL_SIZE, 128);
});

test("creates a square WebP variant and releases the bitmap", async () => {
  const calls = [];
  let closed = false;
  const result = await createThumbnailVariant(new Blob(["large"]), {
    size: 128,
    createImageBitmap: async () => ({
      close: () => {
        closed = true;
      },
    }),
    createCanvas: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (...args) => calls.push(args),
      }),
      toBlob: (resolve, type, quality) => {
        calls.push([type, quality]);
        resolve(new Blob(["small"], { type }));
      },
    }),
  });

  assert.equal(result.type, "image/webp");
  assert.deepEqual(calls[0].slice(1), [0, 0, 128, 128]);
  assert.deepEqual(calls[1], ["image/webp", 0.82]);
  assert.equal(closed, true);
});
