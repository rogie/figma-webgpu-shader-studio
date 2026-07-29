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

    this.inputTexture = null;
    this.video = null; // HTMLVideoElement when the input is a video
    this.htmlElement = null; // canvas child Element for HTML-in-Canvas input
    this.htmlCssSize = null; // logical CSS size of the HTML subject
    this.stageCssSize = { width: DEFAULT_FILL_CSS, height: DEFAULT_FILL_CSS };
    this._onHtmlPaint = this._onHtmlPaint.bind(this);

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
    });

    this.device.addEventListener("uncapturederror", (e) => {
      this.onError(String(e.error && e.error.message ? e.error.message : e.error));
    });
    this.device.lost.then((info) => {
      if (info.reason !== "destroyed") {
        this.onError("WebGPU device lost: " + info.message);
      }
    });

    this.canvas.addEventListener("pointermove", this._onMouse);
    this.canvas.addEventListener("pointerleave", () => {
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

    if (cssWidth != null && cssHeight != null) {
      this.canvas.style.width = `${cssWidth}px`;
      this.canvas.style.height = `${cssHeight}px`;
    } else if (clearCssSize) {
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
      this.frame.output = this.context.getCurrentTexture();
      this.renderFn(this.device, this.frame);
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
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    this.frame.input = this.inputTexture;
    if (displayCss) {
      this.setSize(w, h, {
        cssWidth: displayCss.width,
        cssHeight: displayCss.height,
      });
    } else {
      this.setSize(w, h, { clearCssSize: true });
    }
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

    this._ensureInputTexture(w, h);
    this.device.queue.copyExternalImageToTexture(
      { source, flipY: false },
      { texture: this.inputTexture, premultipliedAlpha: true },
      [w, h]
    );
  }

  setVideoInput(video) {
    this._clearInputResources();
    this.video = video;
    const w = Math.min(MAX_DIM, video.videoWidth || 1024);
    const h = Math.min(MAX_DIM, video.videoHeight || 1024);
    this._ensureInputTexture(w, h);
    this._uploadVideoFrame();
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
    this._ensureInputTexture(size.width, size.height, {
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
  }

  _bindHtmlPaint() {
    this.canvas.addEventListener("paint", this._onHtmlPaint);
  }

  _unbindHtmlPaint() {
    this.canvas.removeEventListener("paint", this._onHtmlPaint);
    if (this.canvas.onpaint === this._onHtmlPaint) {
      this.canvas.onpaint = null;
    }
  }

  _onHtmlPaint() {
    try {
      this._uploadHtmlFrame();
      if (!this.running && this.renderFn) {
        this.frame.output = this.context.getCurrentTexture();
        this.renderFn(this.device, this.frame);
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
      this.frame.output = this.context.getCurrentTexture();
      this.renderFn(this.device, this.frame);
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
      if (this.video) this._uploadVideoFrame();
      if (this.htmlElement) this._uploadHtmlFrame();
      this.frame.output = this.context.getCurrentTexture();
      this.renderFn(this.device, this.frame);
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
    this.canvas.removeEventListener("pointermove", this._onMouse);
    if (this.device) {
      try {
        this.device.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}
