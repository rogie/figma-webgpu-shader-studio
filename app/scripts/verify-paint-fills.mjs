const playwrightCore = await import(
  process.env.PLAYWRIGHT_CORE || "playwright-core"
);
const chromium =
  playwrightCore.chromium || playwrightCore.default?.chromium;

const BASE = process.env.PAINT_FILL_BASE || "http://localhost:5173";
const DRAFTS_KEY = "figma-shader-studio:drafts";

const PASSTHROUGH_EFFECT = `import { defineProperties } from "figma:shaders"

export default function Effect() {}

export function setup(device, frame) {
  frame.state.shaderModule = device.createShaderModule({
    code: \`
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
struct VsIn { @location(0) pos: vec2f, @location(1) uv: vec2f };
struct VsOut { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}
@fragment fn fs_main(in: VsOut) -> @location(0) vec4f {
  return textureSample(inputTex, samp, in.uv);
}
\`,
  });
  frame.state.quad = device.createBuffer({
    size: 6 * 4 * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(frame.state.quad.getMappedRange()).set([
    -1, -1, 0, 1,  1, -1, 1, 1,  -1, 1, 0, 0,
    -1, 1, 0, 0,   1, -1, 1, 1,   1, 1, 1, 0,
  ]);
  frame.state.quad.unmap();
  frame.state.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
}

export function render(device, frame) {
  if (frame.input == null) return;
  const s = frame.state;
  if (s.pipelineFormat !== frame.output.format) {
    s.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: s.shaderModule,
        entryPoint: "vs_main",
        buffers: [{ arrayStride: 16, attributes: [
          { shaderLocation: 0, format: "float32x2", offset: 0 },
          { shaderLocation: 1, format: "float32x2", offset: 8 },
        ] }],
      },
      fragment: { module: s.shaderModule, entryPoint: "fs_main", targets: [{ format: frame.output.format }] },
      primitive: { topology: "triangle-list" },
    });
    s.pipelineFormat = frame.output.format;
  }
  if (!s.bindGroup || s.bindGroupInput !== frame.input) {
    s.bindGroup = device.createBindGroup({
      layout: s.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 1, resource: s.sampler },
        { binding: 2, resource: frame.input.createView() },
      ],
    });
    s.bindGroupInput = frame.input;
  }
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: frame.output.createView(), loadOp: "clear", storeOp: "store" }],
  });
  pass.setPipeline(s.pipeline);
  pass.setBindGroup(0, s.bindGroup);
  pass.setVertexBuffer(0, s.quad);
  pass.draw(6);
  pass.end();
  device.queue.submit([encoder.finish()]);
}
`;

const composerDraft = {
  id: "draft:paint-fill-composer",
  name: "Paint Fill Composer",
  kind: "composition",
  source: "",
  values: {},
  composition: {
    fill: {
      type: "image",
      shaderId: null,
      values: {},
      enabled: true,
      paint: { type: "solid", color: "#FF0000", alpha: 1, opacity: 100 },
    },
    effects: [],
  },
  isPublic: false,
};

const effectDraft = {
  id: "draft:paint-fill-effect",
  name: "Paint Fill Effect",
  kind: "effect",
  source: PASSTHROUGH_EFFECT,
  values: {},
  isPublic: false,
};

function assertNear(actual, expected, label, slack = 12) {
  const ok =
    Math.abs(actual.r - expected.r) <= slack &&
    Math.abs(actual.g - expected.g) <= slack &&
    Math.abs(actual.b - expected.b) <= slack;
  if (!ok) {
    throw new Error(
      `${label}: expected ~${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

async function launchChrome() {
  const attempts = [
    { channel: "chrome" },
    { channel: "chromium" },
    {
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
  ];
  let lastError;
  for (const launch of attempts) {
    try {
      return await chromium.launch({
        ...launch,
        headless: true,
        args: [
          "--enable-unsafe-webgpu",
          "--enable-webgpu-developer-features",
          "--use-angle=metal",
          "--use-fake-ui-for-media-stream",
          "--use-fake-device-for-media-stream",
        ],
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function rasterizeInPage(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  return page.evaluate(async () => {
    const { rasterizePaintFill } = await import("/src/lib/paintFill.js");
    const samples = [];
    const cases = [
      {
        name: "solid",
        fill: { type: "solid", color: "#FF0000", alpha: 1 },
        expect: { r: 255, g: 0, b: 0 },
      },
      {
        name: "linear-start",
        fill: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 90,
            stops: [
              { position: 0, color: "#00FF00", opacity: 100 },
              { position: 100, color: "#0000FF", opacity: 100 },
            ],
          },
        },
        at: [0, 16],
        expect: { r: 0, g: 255, b: 0 },
      },
      {
        name: "radial-center",
        fill: {
          type: "gradient",
          gradient: {
            type: "radial",
            centerX: 50,
            centerY: 50,
            stops: [
              { position: 0, color: "#FF0000", opacity: 100 },
              { position: 100, color: "#0000FF", opacity: 100 },
            ],
          },
        },
        expect: { r: 255, g: 0, b: 0 },
      },
      {
        name: "angular-start",
        fill: {
          type: "gradient",
          gradient: {
            type: "angular",
            angle: 0,
            stops: [
              { position: 0, color: "#00FFFF", opacity: 100 },
              { position: 100, color: "#00FFFF", opacity: 100 },
            ],
          },
        },
        expect: { r: 0, g: 255, b: 255 },
      },
      {
        name: "webcam-snapshot",
        fill: {
          type: "webcam",
          webcam: {
            snapshot: (() => {
              const snap = document.createElement("canvas");
              snap.width = 8;
              snap.height = 8;
              const ctx = snap.getContext("2d");
              ctx.fillStyle = "#FF00FF";
              ctx.fillRect(0, 0, 8, 8);
              return snap.toDataURL("image/png");
            })(),
            opacity: 1,
          },
        },
        expect: { r: 255, g: 0, b: 255 },
      },
    ];
    for (const item of cases) {
      const bitmap = await rasterizePaintFill(item.fill, 32, 32);
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      const [x, y] = item.at || [16, 16];
      const [r, g, b, a] = canvas.getContext("2d").getImageData(x, y, 1, 1).data;
      samples.push({
        name: item.name,
        pixel: { r, g, b, a },
        expect: item.expect,
      });
      bitmap.close?.();
    }
    return samples;
  });
}

async function applyFill(page, detail) {
  await page.waitForSelector("propskit-fill, fig-input-fill", { timeout: 20000 });
  await page.evaluate((value) => {
    const node =
      document.querySelector("propskit-fill") ||
      document.querySelector("fig-input-fill");
    if (!node) throw new Error("fill control missing");
    node.value = value;
    node.dispatchEvent(
      new CustomEvent("input", { bubbles: true, detail: value })
    );
    node.dispatchEvent(
      new CustomEvent("change", { bubbles: true, detail: value })
    );
  }, detail);
}

async function readFillValue(page) {
  return page.evaluate(() => {
    const node =
      document.querySelector("propskit-fill") ||
      document.querySelector("fig-input-fill");
    if (!node) return null;
    try {
      return typeof node.value === "string"
        ? JSON.parse(node.value)
        : node.value;
    } catch {
      return JSON.parse(node.getAttribute("value") || "null");
    }
  });
}

async function sampleCanvas(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector("canvas.preview-canvas");
    if (!canvas) throw new Error("preview canvas missing");
    if (!canvas.width || !canvas.height) {
      return { r: 0, g: 0, b: 0, a: 0, width: canvas.width, height: canvas.height };
    }
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (next) =>
          next ? resolve(next) : reject(new Error("canvas.toBlob failed")),
        "image/png"
      );
    });
    const bitmap = await createImageBitmap(blob);
    const copy = document.createElement("canvas");
    copy.width = bitmap.width;
    copy.height = bitmap.height;
    const ctx = copy.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const x = Math.floor(bitmap.width / 2);
    const y = Math.floor(bitmap.height / 2);
    const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
    return { r, g, b, a, width: bitmap.width, height: bitmap.height };
  });
}

async function openSeededEditor(page, path) {
  await page.addInitScript(
    ({ key, drafts }) => {
      localStorage.setItem(key, JSON.stringify(drafts));
    },
    { key: DRAFTS_KEY, drafts: [composerDraft, effectDraft] }
  );
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("propskit-fill, fig-input-fill", { timeout: 25000 });
  await page.waitForSelector("canvas.preview-canvas", { timeout: 25000 });
  await page.waitForTimeout(1200);
}

const solidBlue = {
  type: "solid",
  color: "#0000FF",
  alpha: 1,
  opacity: 100,
};
const solidGreen = {
  type: "solid",
  color: "#00FF00",
  alpha: 1,
  opacity: 100,
};
const linearBlue = {
  type: "gradient",
  gradient: {
    type: "linear",
    angle: 0,
    interpolationSpace: "srgb",
    stops: [
      { position: 0, color: "#0000FF", opacity: 100 },
      { position: 100, color: "#0000FF", opacity: 100 },
    ],
  },
};
const emptyImage = { type: "image", image: { url: null, scaleMode: "fill" } };
const emptyVideo = { type: "video", video: { url: null, scaleMode: "fill" } };
const webcamFill = { type: "webcam", webcam: { snapshot: null, opacity: 1 } };

async function expectCanvasNear(page, expected, label, slack) {
  const pixel = await sampleCanvas(page);
  console.log(`${label} canvas`, pixel);
  assertNear(pixel, expected, label, slack);
  return pixel;
}

async function exerciseFills(page, label) {
  const results = [];

  await applyFill(page, solidBlue);
  await page.waitForTimeout(500);
  results.push(await expectCanvasNear(page, { r: 0, g: 0, b: 255 }, `${label} solid`, 48));

  await applyFill(page, linearBlue);
  await page.waitForTimeout(500);
  results.push(await expectCanvasNear(page, { r: 0, g: 0, b: 255 }, `${label} gradient`, 48));

  await applyFill(page, emptyImage);
  await page.waitForTimeout(800);
  const imagePixel = await sampleCanvas(page);
  console.log(`${label} image canvas`, imagePixel);
  if (imagePixel.r === 0 && imagePixel.g === 0 && imagePixel.b === 255) {
    throw new Error(`${label} image fill stayed the previous solid/gradient`);
  }
  results.push(imagePixel);

  await applyFill(page, emptyVideo);
  await page.waitForTimeout(2000);
  const videoMeta = await page.evaluate(() => {
    const node =
      document.querySelector("propskit-fill") ||
      document.querySelector("fig-input-fill");
    const swatch = node?.querySelector("fig-swatch");
    const background = swatch?.getAttribute("background") || "";
    const value =
      typeof node?.value === "string"
        ? (() => {
            try {
              return JSON.parse(node.value);
            } catch {
              return null;
            }
          })()
        : node?.value;
    return {
      type: value?.type,
      url: value?.video?.url || null,
      background: background.slice(0, 48),
      hasPoster: background.startsWith("url("),
    };
  });
  console.log(`${label} video meta`, videoMeta);
  if (videoMeta.type !== "video" || !videoMeta.url) {
    throw new Error(`${label} video fill did not receive a default url`);
  }
  if (!videoMeta.hasPoster) {
    throw new Error(`${label} video swatch had no thumbnail`);
  }
  const videoPixel = await sampleCanvas(page);
  console.log(`${label} video canvas`, videoPixel);
  if (
    Math.abs(videoPixel.r - imagePixel.r) < 8 &&
    Math.abs(videoPixel.g - imagePixel.g) < 8 &&
    Math.abs(videoPixel.b - imagePixel.b) < 8
  ) {
    throw new Error(`${label} video canvas matched the still image`);
  }
  results.push(videoPixel);

  await applyFill(page, webcamFill);
  await page.waitForTimeout(2500);
  const webcamMeta = await page.evaluate(() => {
    const video = document.querySelector("video");
    const stream = video?.srcObject;
    return {
      fillType: (() => {
        const node =
          document.querySelector("propskit-fill") ||
          document.querySelector("fig-input-fill");
        const value =
          typeof node?.value === "string"
            ? (() => {
                try {
                  return JSON.parse(node.value);
                } catch {
                  return null;
                }
              })()
            : node?.value;
        return value?.type;
      })(),
      hasStream: Boolean(stream),
      liveTracks: stream?.getVideoTracks?.().some((track) => track.readyState === "live") || false,
      videoWidth: video?.videoWidth || 0,
    };
  });
  console.log(`${label} webcam meta`, webcamMeta);
  if (webcamMeta.fillType !== "webcam") {
    throw new Error(`${label} webcam fill type was ${webcamMeta.fillType}`);
  }
  if (!webcamMeta.hasStream || !webcamMeta.liveTracks || webcamMeta.videoWidth < 1) {
    throw new Error(`${label} webcam did not start a live stream`);
  }
  const webcamPixel = await sampleCanvas(page);
  console.log(`${label} webcam canvas`, webcamPixel);
  if (webcamPixel.a === 0) {
    throw new Error(`${label} webcam canvas was empty`);
  }
  results.push(webcamPixel);

  await applyFill(page, solidGreen);
  await page.waitForTimeout(600);
  results.push(await expectCanvasNear(page, { r: 0, g: 255, b: 0 }, `${label} back to solid`, 48));
  return results;
}

const browser = await launchChrome();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const failures = [];

try {
  const rasters = await rasterizeInPage(page);
  for (const sample of rasters) {
    try {
      assertNear(sample.pixel, sample.expect, `raster ${sample.name}`);
      console.log(`ok raster ${sample.name}`, sample.pixel);
    } catch (error) {
      failures.push(error.message);
      console.error(error.message);
    }
  }

  await context.close();
  const editorContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["camera"],
  });
  const editor = await editorContext.newPage();

  await openSeededEditor(editor, "/composer/draft%3Apaint-fill-composer");
  const composerValue = await readFillValue(editor);
  console.log("composer restored fill", composerValue);
  if (composerValue?.type !== "solid" || composerValue?.color?.toUpperCase() !== "#FF0000") {
    failures.push(
      `composer did not restore stored solid paint: ${JSON.stringify(composerValue)}`
    );
  }
  const composerCanvas = await sampleCanvas(editor);
  console.log("composer restored canvas", composerCanvas);
  try {
    assertNear(composerCanvas, { r: 255, g: 0, b: 0 }, "composer restored solid", 48);
  } catch (error) {
    failures.push(error.message);
    console.error(error.message);
  }

  try {
    await exerciseFills(editor, "composer");
  } catch (error) {
    failures.push(error.message);
    console.error(error.message);
  }

  await editorContext.close();
  const effectContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["camera"],
  });
  const effect = await effectContext.newPage();
  await openSeededEditor(effect, "/shader/draft%3Apaint-fill-effect");
  try {
    await exerciseFills(effect, "effect");
  } catch (error) {
    failures.push(error.message);
    console.error(error.message);
  }
  await effectContext.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`FAILED ${failures.length} check(s)`);
  process.exit(1);
}
console.log("paint fill browser checks passed");
