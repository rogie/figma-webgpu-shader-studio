import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGradientCss,
  coverContainRect,
  graphTypeForPaint,
  hexToRgba,
  interpolationClause,
  isPaintFillType,
  paintFillAlpha,
  paintImageSource,
  resolvePaintFill,
} from "./paintFill.js";

test("identifies paint fill types and graph mapping", () => {
  assert.equal(isPaintFillType("solid"), true);
  assert.equal(isPaintFillType("gradient"), true);
  assert.equal(isPaintFillType("webcam"), true);
  assert.equal(isPaintFillType("shader"), false);
  assert.equal(graphTypeForPaint("solid"), "image");
  assert.equal(graphTypeForPaint("gradient"), "image");
  assert.equal(graphTypeForPaint("webcam"), "video");
  assert.equal(graphTypeForPaint("video"), "video");
  assert.equal(graphTypeForPaint("shader"), "shader");
});

test("keeps the picker video shape including poster and colorSpace", () => {
  const next = resolvePaintFill(
    {
      type: "video",
      colorSpace: "srgb",
      video: {
        url: "/clip.mp4",
        poster: "blob:poster",
        scaleMode: "fit",
        scale: 40,
        opacity: 0.8,
      },
    },
    { defaultVideoUrl: "/sample.mp4" }
  );
  assert.equal(next.colorSpace, "srgb");
  assert.equal(next.video.poster, "blob:poster");
  assert.equal(next.video.url, "/clip.mp4");
  assert.equal(next.video.scaleMode, "fit");
});

test("fills in default video and image urls", () => {
  assert.equal(
    resolvePaintFill(
      { type: "video", video: { url: null } },
      { defaultVideoUrl: "/sample.mp4" }
    ).video.scaleMode,
    "fit"
  );
  assert.equal(
    resolvePaintFill(
      { type: "video", video: { url: null, scaleMode: "fit" } },
      { defaultVideoUrl: "/sample.mp4" }
    ).video.url,
    "/sample.mp4"
  );
  assert.equal(
    resolvePaintFill(
      { type: "video", video: { url: "blob:abc", scaleMode: "fit" } },
      { defaultVideoUrl: "/sample.mp4" }
    ).video.url,
    "blob:abc"
  );
  assert.equal(
    resolvePaintFill(
      { type: "image", image: { scaleMode: "fill" } },
      { defaultImageUrl: "/sample.png" }
    ).image.url,
    "/sample.png"
  );
  assert.equal(
    resolvePaintFill(
      { type: "image" },
      { defaultImageUrl: "/sample.png" }
    ).image.scaleMode,
    "fit"
  );
});

test("reads alpha from 0-1 and opacity 0-100", () => {
  assert.equal(paintFillAlpha({ alpha: 0.4 }), 0.4);
  assert.equal(paintFillAlpha({ opacity: 40 }), 0.4);
  assert.equal(paintFillAlpha({ alpha: 80 }), 0.8);
  assert.equal(paintFillAlpha({}), 1);
});

test("parses hex colors", () => {
  assert.deepEqual(hexToRgba("#ff0000", 0.5), { r: 255, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(hexToRgba("#0f8", 1), { r: 0, g: 255, b: 136, a: 1 });
  assert.deepEqual(hexToRgba("#00ff0080", 1), { r: 0, g: 255, b: 0, a: 128 / 255 });
});

test("reads image and webcam media from either picker shape", () => {
  assert.equal(
    paintImageSource({
      type: "webcam",
      webcam: { snapshot: "data:image/png;base64,abc", opacity: 0.5 },
    }).url,
    "data:image/png;base64,abc"
  );
  assert.equal(
    paintImageSource({
      type: "webcam",
      image: { url: "data:image/png;base64,picker", scaleMode: "fit" },
    }).url,
    "data:image/png;base64,picker"
  );
  assert.equal(
    paintImageSource({
      type: "webcam",
      webcam: {
        snapshot: "data:image/png;base64,abc",
        scaleMode: "fit",
        scale: 25,
        opacity: 0.5,
      },
    }).scaleMode,
    "fit"
  );
  assert.equal(
    paintImageSource({
      type: "image",
      image: { url: "https://example.com/a.png", scaleMode: "tile", scale: 25 },
    }).scaleMode,
    "tile"
  );
});

test("builds CSS gradients from the picker payload", () => {
  assert.equal(interpolationClause({ interpolationSpace: "srgb" }), "");
  assert.equal(
    interpolationClause({
      interpolationSpace: "oklch",
      hueInterpolation: "longer",
    }),
    "in oklch longer hue"
  );
  const css = buildGradientCss({
    type: "linear",
    angle: 90,
    interpolationSpace: "oklab",
    stops: [
      { position: 0, color: "#FF0000", opacity: 100 },
      { position: 100, color: "#0000FF", opacity: 50 },
    ],
  });
  assert.match(css, /^linear-gradient\(90deg in oklab,/);
  assert.match(css, /rgba\(255, 0, 0, 1\) 0%/);
  assert.match(css, /rgba\(0, 0, 255, 0.5\) 100%/);
});

test("cover and contain keep aspect", () => {
  const cover = coverContainRect("fill", 200, 100, 100, 100);
  assert.equal(cover.height, 100);
  assert.equal(cover.width, 200);
  assert.equal(cover.x, -50);
  const fit = coverContainRect("fit", 200, 100, 100, 100);
  assert.equal(fit.width, 100);
  assert.equal(fit.height, 50);
  assert.equal(fit.y, 25);
});
