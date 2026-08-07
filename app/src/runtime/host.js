// WebGPU host: owns the GPUDevice + canvas context and drives the Figma shader
// module contract (`setup(device, frame)` once, `render(device, frame)` per
// animation frame). See skills/v3.md.tmpl for the frame field semantics.

import { cssSizeToDevicePixels } from "./dpi.js";

const MAX_DIM = 2048;
const DEFAULT_FILL_CSS = 512;

export class ShaderHost {
  constructor(canvas, { onError, onStatus } = {}) {
    this.canvas = canvas;
    this.onError = onError || (() => {});
    this.onStatus = onStatus || (() => {});

    this.device = null;
    this.context = null;
    this.format = "rgba8unorm";

    this.setupFn = null;
    this.renderFn = null;
    this.isFill = false;
    this.effectVisible = true;

    this.inputTexture = null;
    this.video = null; // HTMLVideoElement when the input is a video
    this.htmlElement = null; // canvas child Element for HTML-in-Canvas input
    this.htmlCssSize = null; // logical CSS size of the HTML subject
    this.stageCssSize = { width: DEFAULT_FILL_CSS, height: DEFAULT_FILL_CSS };
    this._onHtmlPaint = this._onHtmlPaint.bind(this);

    this._passthroughPipeline = null;
    this._passthroughFormat = null;
    this._passthroughSampler = null;
    this._passthroughBindLayout = null;

    this.frame = {
      input: null,
      output: null,
      state: {},
      params: {},
      time: 0,
      deltaTime: 0,
      frame: 0,
      mousePosition: { x: 0, y: 0 },
    };

    this.ready = false;
    this.running = false;
    this.rafId = 0;
    this.startTime = 0;
    this.lastTime = 0;
    this._loopBound = this._loop.bind(this);
    this._onMouse = this._onMouse.bind(this);
  }

  async init() {
    if (!navigator.gpu) {
      throw new Error(
        "WebGPU is not available in this browser. Use Chrome/Edge, or Safari Technology Preview."
      );
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("Failed to acquire a WebGPU adapter.");
    this.device = await adapter.requestDevice();
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context = this.canvas.getContext("webgpu");
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
      // COPY_SRC lets thumbnails read back the swapchain texture. Without it,
      // canvas 2D drawImage often captures cleared/black frames after composite.
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    this.device.addEventListener("uncapturederror", (e) => {
      this.onError(String(e.error && e.error.message ? e.error.message : e.error));
    });
    this.device.lost.then((info) => {
      if (info.reason !== "destroyed") {
        this.onError("WebGPU device lost: " + info.message);
      }
    });

    this.canvas.addEventListener?.("pointermove", this._onMouse);
    this.canvas.addEventListener?.("pointerleave", () => {
      this.frame.mousePosition = { x: 0, y: 0 };
    });
    this.ready = true;
  }

  _onMouse(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    this.frame.mousePosition = {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    };
  }

  /**
   * Set the canvas buffer size in device pixels.
   * Optionally set CSS display size so backing store matches devicePixelRatio
   * (fills / HTML). Image/video effects leave CSS unset (1 buffer px ≈ 1 CSS px
   * before object-fit), matching Figma's input-sized effect targets.
   */
  setSize(w, h, { cssWidth, cssHeight, clearCssSize = false } = {}) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    const changed = this.canvas.width !== w || this.canvas.height !== h;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;

    if (cssWidth != null && cssHeight != null && this.canvas.style) {
      this.canvas.style.width = `${cssWidth}px`;
      this.canvas.style.height = `${cssHeight}px`;
    } else if (clearCssSize && this.canvas.style) {
      this.canvas.style.removeProperty("width");
      this.canvas.style.removeProperty("height");
    }
    return changed;
  }

  setStageCssSize(cssWidth, cssHeight) {
    const width = Math.max(1, cssWidth || DEFAULT_FILL_CSS);
    const height = Math.max(1, cssHeight || DEFAULT_FILL_CSS);
    this.stageCssSize = { width, height };
    if (!this.ready) return;
    if (this.isFill) {
      this.resizeFill(width, height);
      return;
    }
    // HTML subjects stay at a fixed CSS size; re-sync when DPR changes.
    if (this.htmlElement && this.htmlCssSize) {
      this._syncHtmlDpi();
    }
  }

  _syncHtmlDpi() {
    if (!this.htmlElement || !this.htmlCssSize) return false;
    const size = cssSizeToDevicePixels(
      this.htmlCssSize.width,
      this.htmlCssSize.height,
      MAX_DIM
    );
    if (
      this.inputTexture &&
      this.inputTexture.width === size.width &&
      this.inputTexture.height === size.height &&
      this.canvas.width === size.width &&
      this.canvas.height === size.height
    ) {
      return false;
    }
    this._ensureInputTexture(size.width, size.height, {
      width: size.cssWidth,
      height: size.cssHeight,
    });
    this.canvas.requestPaint?.();
    try {
      this._uploadHtmlFrame();
    } catch {
      /* wait for paint */
    }
    return true;
  }

  setFillSize(cssWidth, cssHeight) {
    const size = cssSizeToDevicePixels(cssWidth, cssHeight, MAX_DIM);
    return this.setSize(size.width, size.height, {
      cssWidth: size.cssWidth,
      cssHeight: size.cssHeight,
    });
  }

  resizeFill(cssWidth, cssHeight) {
    if (!this.ready || !this.isFill) return false;
    const changed = this.setFillSize(cssWidth, cssHeight);
    if (!changed || !this.renderFn) return changed;
    this._teardownState();
    try {
      this.frame.output = this.context.getCurrentTexture();
      if (this.setupFn) this.setupFn(this.device, this.frame);
      this._present();
    } catch (err) {
      this.onError(err && err.message ? err.message : String(err));
    }
    return true;
  }

  _teardownState() {
    const s = this.frame.state;
    for (const key in s) {
      const v = s[key];
      if (v && typeof v.destroy === "function") {
        try {
          v.destroy();
        } catch {
          /* ignore */
        }
      }
    }
    this.frame.state = {};
  }

  _clearInputResources() {
    this._unbindHtmlPaint();
    if (this.inputTexture) {
      this.inputTexture.destroy();
      this.inputTexture = null;
    }
    this.video = null;
    this.htmlElement = null;
    this.htmlCssSize = null;
    this.frame.input = null;
  }

  _ensureInputTexture(w, h, displayCss = null) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    let textureChanged = false;
    if (
      !this.inputTexture ||
      this.inputTexture.width !== w ||
      this.inputTexture.height !== h
    ) {
      if (this.inputTexture) {
        this.inputTexture.destroy();
        this.inputTexture = null;
      }
      this.inputTexture = this.device.createTexture({
        size: [w, h],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      textureChanged = true;
    }
    this.frame.input = this.inputTexture;
    let sizeChanged = false;
    if (displayCss) {
      sizeChanged = this.setSize(w, h, {
        cssWidth: displayCss.width,
        cssHeight: displayCss.height,
      });
    } else {
      sizeChanged = this.setSize(w, h, { clearCssSize: true });
    }
    return textureChanged || sizeChanged;
  }

  // After input size changes, rebuild shader state (many effects size
  // resources from setup) and present immediately — including when paused.
  _rebindAfterInputChange(sizeChanged) {
    if (!this.ready || !this.renderFn) return;
    if (sizeChanged) {
      this._teardownState();
      try {
        this.frame.output = this.context.getCurrentTexture();
        if (this.setupFn) this.setupFn(this.device, this.frame);
      } catch (err) {
        this.onError(err && err.message ? err.message : String(err));
        return;
      }
    }
    this.redraw();
  }

  // Replace the input from an ImageBitmap / VideoFrame source (static).
  setImageInput(source, width, height) {
    this._clearInputResources();
    if (!source) return;
    let w = width || source.width;
    let h = height || source.height;
    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    const sizeChanged = this._ensureInputTexture(w, h);
    this.device.queue.copyExternalImageToTexture(
      { source, flipY: false },
      { texture: this.inputTexture, premultipliedAlpha: true },
      [w, h]
    );
    this._rebindAfterInputChange(sizeChanged);
  }

  setVideoInput(video) {
    this._clearInputResources();
    this.video = video;
    const w = Math.min(MAX_DIM, video.videoWidth || 1024);
    const h = Math.min(MAX_DIM, video.videoHeight || 1024);
    const sizeChanged = this._ensureInputTexture(w, h);
    this._uploadVideoFrame();
    this._rebindAfterInputChange(sizeChanged);
  }

  // HTML-in-Canvas: `element` must be a direct child of this.canvas with
  // layoutsubtree enabled. Copied into frame.input each paint / frame.
  // Logical CSS size × devicePixelRatio → texture / canvas buffer.
  setHtmlInput(element, width, height) {
    if (!element) {
      this._clearInputResources();
      return;
    }
    if (typeof this.device.queue.copyElementImageToTexture !== "function") {
      throw new Error(
        "copyElementImageToTexture is unavailable. Enable chrome://flags/#canvas-draw-element."
      );
    }
    this._clearInputResources();
    this.htmlElement = element;
    const cssWidth =
      width ||
      Math.max(1, Math.round(element.offsetWidth || element.clientWidth || 960));
    const cssHeight =
      height ||
      Math.max(
        1,
        Math.round(element.offsetHeight || element.clientHeight || 720)
      );
    this.htmlCssSize = { width: cssWidth, height: cssHeight };
    const size = cssSizeToDevicePixels(cssWidth, cssHeight, MAX_DIM);
    const sizeChanged = this._ensureInputTexture(size.width, size.height, {
      width: size.cssWidth,
      height: size.cssHeight,
    });
    this._bindHtmlPaint();
    this.canvas.requestPaint?.();
    try {
      this._uploadHtmlFrame();
    } catch {
      // First snapshot may not exist until the next paint event.
    }
    this._rebindAfterInputChange(sizeChanged);
  }

  _bindHtmlPaint() {
    this.canvas.addEventListener?.("paint", this._onHtmlPaint);
  }

  _unbindHtmlPaint() {
    this.canvas.removeEventListener?.("paint", this._onHtmlPaint);
    if (this.canvas.onpaint === this._onHtmlPaint) {
      this.canvas.onpaint = null;
    }
  }

  _onHtmlPaint() {
    try {
      if (!this.running && this.renderFn) {
        this._present();
      } else {
        this._uploadHtmlFrame();
      }
    } catch (err) {
      this.onError(err && err.message ? err.message : String(err));
    }
  }

  _uploadVideoFrame() {
    const video = this.video;
    if (!video || !this.inputTexture) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (!video.videoWidth || !video.videoHeight) return;
    try {
      this.device.queue.copyExternalImageToTexture(
        { source: video, flipY: false },
        { texture: this.inputTexture, premultipliedAlpha: true },
        [this.inputTexture.width, this.inputTexture.height]
      );
    } catch {
      // Skip frames that aren't importable yet (no backing resource).
    }
  }

  _uploadHtmlFrame() {
    if (!this.htmlElement || !this.inputTexture) return;
    const queue = this.device.queue;
    const texture = this.inputTexture;
    const width = texture.width;
    const height = texture.height;
    // Chrome 150+: dictionary form with nested destination.texture.
    // Older builds accepted (element, { texture }) or (element, w, h, { texture }).
    try {
      queue.copyElementImageToTexture(
        { source: this.htmlElement },
        {
          destination: { texture, premultipliedAlpha: true },
          width,
          height,
        }
      );
      return;
    } catch {
      /* try legacy signatures below */
    }
    try {
      queue.copyElementImageToTexture(this.htmlElement, {
        texture,
        premultipliedAlpha: true,
      });
      return;
    } catch {
      /* try older 4-arg form */
    }
    try {
      queue.copyElementImageToTexture(this.htmlElement, width, height, {
        texture,
        premultipliedAlpha: true,
      });
    } catch {
      // Skip until a paint snapshot exists / API is available.
    }
  }

  clearInput() {
    this._clearInputResources();
  }

  setParams(params) {
    this.frame.params = params || {};
    // When the RAF loop is already presenting, the next frame picks up params.
    // Forcing an extra synchronous present here hitchs the main thread and
    // cancels native range-slider drags in the properties panel.
    if (!this.running) this.redraw();
  }

  setEffectVisible(visible) {
    this.effectVisible = Boolean(visible);
    this.redraw();
  }

  redraw() {
    if (!this.ready || !this.renderFn) return;
    try {
      this._present();
    } catch (err) {
      this.onError(err && err.message ? err.message : String(err));
    }
  }

  async captureInputBitmap({ width, height } = {}) {
    if (!this.ready || !this.inputTexture) return null;
    if (this.video) this._uploadVideoFrame();
    if (this.htmlElement) this._uploadHtmlFrame();

    const texture = this.inputTexture;
    const srcW = texture.width;
    const srcH = texture.height;
    const bytesPerRow = Math.ceil((srcW * 4) / 256) * 256;
    const readbackBuffer = this.device.createBuffer({
      size: bytesPerRow * srcH,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    try {
      const encoder = this.device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture },
        { buffer: readbackBuffer, bytesPerRow },
        { width: srcW, height: srcH }
      );
      this.device.queue.submit([encoder.finish()]);
      await readbackBuffer.mapAsync(GPUMapMode.READ);
      const packed = this._packTextureReadback(
        new Uint8Array(readbackBuffer.getMappedRange()),
        srcW,
        srcH,
        bytesPerRow,
        "rgba8unorm"
      );
      readbackBuffer.unmap();

      const targetW = Math.max(1, Math.round(width || srcW));
      const targetH = Math.max(1, Math.round(height || srcH));
      const scale = Math.max(targetW / srcW, targetH / srcH);
      const cropW = Math.max(1, targetW / scale);
      const cropH = Math.max(1, targetH / scale);
      return await createImageBitmap(
        new ImageData(packed, srcW, srcH),
        Math.max(0, (srcW - cropW) / 2),
        Math.max(0, (srcH - cropH) / 2),
        cropW,
        cropH,
        {
          resizeWidth: targetW,
          resizeHeight: targetH,
          resizeQuality: "high",
        }
      );
    } finally {
      readbackBuffer.destroy();
    }
  }

  /**
   * Snapshot the current preview into a square image blob (default 512²).
   * Reads pixels via copyTextureToBuffer — WebGPU canvas 2D drawImage often
   * returns a cleared/black frame once the browser has composited.
   */
  async captureThumbnailBlob({
    width = 512,
    height = 512,
    type = "image/webp",
    quality = 0.85,
  } = {}) {
    if (!this.ready || !this.canvas?.width || !this.canvas?.height) return null;
    if (!this.renderFn) return null;

    const wasRunning = this.running;
    let readbackBuffer = null;
    try {
      if (wasRunning) this.stop();

      const texture = this._present();
      if (!texture) return null;

      const srcW = texture.width;
      const srcH = texture.height;
      const bytesPerPixel = 4;
      const bytesPerRow = Math.ceil((srcW * bytesPerPixel) / 256) * 256;
      readbackBuffer = this.device.createBuffer({
        size: bytesPerRow * srcH,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

      const encoder = this.device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture },
        { buffer: readbackBuffer, bytesPerRow },
        { width: srcW, height: srcH }
      );
      this.device.queue.submit([encoder.finish()]);
      await readbackBuffer.mapAsync(GPUMapMode.READ);

      const packed = this._packTextureReadback(
        new Uint8Array(readbackBuffer.getMappedRange()),
        srcW,
        srcH,
        bytesPerRow
      );
      readbackBuffer.unmap();
      readbackBuffer.destroy();
      readbackBuffer = null;

      const source = document.createElement("canvas");
      source.width = srcW;
      source.height = srcH;
      source.getContext("2d").putImageData(new ImageData(packed, srcW, srcH), 0, 0);

      const thumb = document.createElement("canvas");
      thumb.width = width;
      thumb.height = height;
      const ctx = thumb.getContext("2d");
      if (!ctx) return null;

      const scale = Math.max(width / srcW, height / srcH);
      const dw = srcW * scale;
      const dh = srcH * scale;
      ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);

      return await new Promise((resolve) => {
        thumb.toBlob((blob) => resolve(blob || null), type, quality);
      });
    } catch {
      return null;
    } finally {
      if (readbackBuffer) {
        try {
          readbackBuffer.destroy();
        } catch {
          /* ignore */
        }
      }
      if (wasRunning) this.start();
    }
  }

  _packTextureReadback(
    data,
    width,
    height,
    bytesPerRow,
    format = this.format
  ) {
    const packed = new Uint8ClampedArray(width * height * 4);
    const bgra = format.startsWith("bgra");
    for (let y = 0; y < height; y++) {
      const srcRow = y * bytesPerRow;
      const dstRow = y * width * 4;
      for (let x = 0; x < width; x++) {
        const i = srcRow + x * 4;
        const o = dstRow + x * 4;
        const r = bgra ? data[i + 2] : data[i];
        const g = data[i + 1];
        const b = bgra ? data[i] : data[i + 2];
        const a = data[i + 3];
        // Canvas is configured premultiplied; ImageData wants straight alpha.
        if (a > 0 && a < 255) {
          const inv = 255 / a;
          packed[o] = Math.min(255, Math.round(r * inv));
          packed[o + 1] = Math.min(255, Math.round(g * inv));
          packed[o + 2] = Math.min(255, Math.round(b * inv));
        } else {
          packed[o] = r;
          packed[o + 1] = g;
          packed[o + 2] = b;
        }
        packed[o + 3] = a;
      }
    }
    return packed;
  }

  _ensurePassthroughPipeline(format) {
    if (
      this._passthroughPipeline &&
      this._passthroughFormat === format &&
      this._passthroughSampler &&
      this._passthroughBindLayout
    ) {
      return;
    }

    const module = this.device.createShaderModule({
      code: `
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VsOut {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  var result: VsOut;
  let p = pos[vi];
  result.position = vec4f(p, 0.0, 1.0);
  result.uv = vec2f(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
  return result;
}

@group(0) @binding(0) var srcSampler: sampler;
@group(0) @binding(1) var srcTexture: texture_2d<f32>;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  return textureSample(srcTexture, srcSampler, in.uv);
}
`,
    });

    this._passthroughBindLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" },
        },
      ],
    });

    this._passthroughSampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    this._passthroughPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this._passthroughBindLayout],
      }),
      vertex: { module, entryPoint: "vs_main" },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    });
    this._passthroughFormat = format;
  }

  _presentPassthrough() {
    const output = this.frame.output || this.context.getCurrentTexture();
    this.frame.output = output;
    const encoder = this.device.createCommandEncoder();

    if (!this.frame.input) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: output.createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      });
      pass.end();
      this.device.queue.submit([encoder.finish()]);
      return output;
    }

    this._ensurePassthroughPipeline(output.format);
    const bindGroup = this.device.createBindGroup({
      layout: this._passthroughBindLayout,
      entries: [
        { binding: 0, resource: this._passthroughSampler },
        { binding: 1, resource: this.frame.input.createView() },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: output.createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    pass.setPipeline(this._passthroughPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return output;
  }

  _present() {
    if (this.video) this._uploadVideoFrame();
    if (this.htmlElement) this._uploadHtmlFrame();
    this.frame.output = this.context.getCurrentTexture();
    if (!this.effectVisible) {
      return this._presentPassthrough();
    }
    this.renderFn(this.device, this.frame);
    return this.frame.output;
  }

  // Load a compiled module ({ setup, render }) and re-run setup with validation.
  async setModule({ setup, render }, { isFill } = {}) {
    this.setupFn = setup;
    this.renderFn = render;
    this.isFill = Boolean(isFill);
    this._teardownState();
    this.frame.frame = 0;
    this.startTime = performance.now();
    this.lastTime = this.startTime;

    // Fills have no input — size the target to the preview stage at device DPI.
    if (this.isFill && !this.frame.input) {
      this.setFillSize(this.stageCssSize.width, this.stageCssSize.height);
    }

    this.device.pushErrorScope("validation");
    let jsError = null;
    try {
      this.frame.output = this.context.getCurrentTexture();
      if (this.setupFn) this.setupFn(this.device, this.frame);
      this._present();
    } catch (err) {
      jsError = err && err.message ? err.message : String(err);
    }
    const gpuError = await this.device.popErrorScope();

    if (jsError) {
      this.onError(jsError);
      return false;
    }
    if (gpuError) {
      this.onError(gpuError.message);
      return false;
    }
    this.onError(null);
    return true;
  }

  start() {
    if (this.running || !this.renderFn) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this._loopBound);
  }

  renderFrame(time, deltaTime, frameNumber) {
    if (!this.ready || !this.renderFn) return null;
    this.frame.time = time;
    this.frame.deltaTime = deltaTime;
    this.frame.frame = frameNumber;
    return this._present();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  _loop(now) {
    if (!this.running) return;
    this.frame.time = now - this.startTime;
    this.frame.deltaTime = now - this.lastTime;
    this.lastTime = now;
    this.frame.frame += 1;

    try {
      this._present();
    } catch (err) {
      this.onError(err && err.message ? err.message : String(err));
      this.stop();
      return;
    }
    this.rafId = requestAnimationFrame(this._loopBound);
  }

  destroy() {
    this.stop();
    this._teardownState();
    this.clearInput();
    this.canvas.removeEventListener?.("pointermove", this._onMouse);
    if (this.device) {
      try {
        this.device.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}
