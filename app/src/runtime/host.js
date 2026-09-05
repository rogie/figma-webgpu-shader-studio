// WebGPU host: owns the GPUDevice + canvas context and drives the Figma shader
// module contract (`setup(device, frame)` once, `render(device, frame)` per
// animation frame). See skills/v3.md.tmpl for the frame field semantics.

import {
  adaptiveRenderScale,
  cssSizeToDevicePixels,
  normalizePreviewPixelRatioMode,
  previewPixelRatioForMode,
  readPreviewPixelRatioMode,
} from "./dpi.js";
import { measurePerf, perfNow, recordPerf } from "./perf.js";
import {
  createSilentAudioFrame,
  zeroAudioFrame,
} from "./audioInput.js";

const MAX_DIM = 2048;
export const VIEW_MAX_DIM = 8192;
const DEFAULT_FILL_CSS = 512;
const SOURCE_FILL_TYPES = new Set(["image", "video", "webcam", "html"]);

function collectShaderModules(value, modules, seen) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return;
  if (seen.has(value)) return;
  seen.add(value);

  if (typeof value.getCompilationInfo === "function") {
    modules.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectShaderModules(item, modules, seen));
    return;
  }
  if (value instanceof Map || value instanceof Set) {
    value.forEach((item) => collectShaderModules(item, modules, seen));
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype === Object.prototype || prototype === null) {
    Object.values(value).forEach((item) =>
      collectShaderModules(item, modules, seen)
    );
  }
}

function formatShaderCompilationMessage(message) {
  const line = Number(message?.lineNum) || 0;
  const column = Number(message?.linePos) || 0;
  const location = line
    ? ` at WGSL line ${line}${column ? `, column ${column}` : ""}`
    : "";
  return `Shader compilation ${message?.type || "error"}${location}: ${
    message?.message || "Shader compilation failed."
  }`;
}

export class ShaderHost {
  constructor(
    canvas,
    { onError, onStatus, maxDimension, previewPixelRatioMode } = {}
  ) {
    this.canvas = canvas;
    this.onError = onError || (() => {});
    this.onStatus = onStatus || (() => {});
    this.maxDimension = Math.max(
      1,
      Math.round(Number(maxDimension) || MAX_DIM)
    );

    this.device = null;
    this.context = null;
    this.format = "rgba8unorm";

    this.setupFn = null;
    this.renderFn = null;
    this.isFill = false;
    this.isAnimated = false;
    this.usesMouse = false;
    this.supportsRenderScale = false;
    this.effectVisible = true;
    this.active = true;
    this.previewZoom = 1;
    this.previewPixelRatioMode = previewPixelRatioMode
      ? normalizePreviewPixelRatioMode(previewPixelRatioMode, {
          allowNative: true,
        })
      : readPreviewPixelRatioMode();
    this.logicalOutputSize = { width: 1, height: 1 };
    this.outputCssSize = null;
    this._zoomResizeTimer = 0;

    this.inputTexture = null;
    this.video = null; // HTMLVideoElement when the input is a video
    this.htmlElement = null; // canvas child Element for HTML-in-Canvas input
    this.htmlCssSize = null; // logical CSS size of the HTML subject
    this._htmlFrameDirty = false;
    this._videoFrameDirty = false;
    this._videoFrameCallbackId = 0;
    this._videoPollId = 0;
    this._lastVideoTime = -1;
    this.stageCssSize = { width: DEFAULT_FILL_CSS, height: DEFAULT_FILL_CSS };
    this._fillResizeTimer = 0;
    this._onHtmlPaint = this._onHtmlPaint.bind(this);

    this._passthroughPipeline = null;
    this._passthroughFormat = null;
    this._passthroughSampler = null;
    this._passthroughBindLayout = null;
    this._passthroughBindGroup = null;
    this._passthroughInputTexture = null;
    this.compositionLayers = null;
    this._compositionTextures = [];
    this._compositorTextures = [];
    this._compositorTransparentTexture = null;
    this._compositorPipelines = new Map();
    this._compositorSampler = null;
    this._compositorBindLayout = null;
    this._sourceFillPipelines = new Map();
    this._sourceFillSampler = null;
    this._sourceFillBindLayout = null;

    this.frame = {
      input: null,
      output: null,
      state: {},
      params: {},
      time: 0,
      deltaTime: 0,
      frame: 0,
      renderScale: 1,
      mousePosition: { x: 0, y: 0 },
      audio: createSilentAudioFrame(),
    };
    this._audioBus = null;
    this.supportsAudio = false;
    // Actual GPU presents. Independent of frame.frame, which is the shader
    // clock and resets on compile. Compositions often present from video, HTML,
    // or redraws without advancing that clock.
    this.presentedFrames = 0;

    this.ready = false;
    this.running = false;
    this.rafId = 0;
    this._seekPresentRaf = 0;
    this._mediaSeekVersions = new WeakMap();
    this.startTime = 0;
    this.lastTime = 0;
    this._playbackGeneration = 0;
    this._shaderCompilationErrorMessage = null;
    this._pointerSurface = null;
    this._mouseResetId = 0;
    this._loopBound = this._loop.bind(this);
    this._onMouse = this._onMouse.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
    // While > 0, setSize defers canvas dimension changes so WebGPU readback
    // cannot lose its swapchain texture mid-copy (e.g. export menu close).
    this._captureLock = 0;
    this._pendingSize = null;
    this._pendingAdaptiveResize = false;
  }

  async init() {
    const startedAt = perfNow();
    if (!navigator.gpu) {
      throw new Error(
        "WebGPU is not available in this browser. Use Chrome/Edge, or Safari Technology Preview."
      );
    }
    let adapter = null;
    try {
      adapter = await navigator.gpu.requestAdapter({
        powerPreference: "high-performance",
      });
    } catch {
      // Older implementations may reject the preference option.
    }
    adapter ||= await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("Failed to acquire a WebGPU adapter.");
    this.device = await adapter.requestDevice();
    const deviceMax = this.device.limits?.maxTextureDimension2D;
    if (deviceMax) {
      this.maxDimension = Math.min(this.maxDimension, deviceMax);
    }
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
      const message = String(e.error?.message || e.error);
      if (
        this._shaderCompilationErrorMessage &&
        /\[Invalid (?:RenderPipeline|CommandBuffer)/.test(message)
      ) {
        return;
      }
      this.onError(message);
    });
    this.device.lost.then((info) => {
      if (info.reason !== "destroyed") {
        this.onError("WebGPU device lost: " + info.message);
      }
    });

    this.canvas.addEventListener?.("pointermove", this._onMouse);
    this.canvas.addEventListener?.("pointerleave", this._onMouseLeave);
    this.ready = true;
    measurePerf("host.init", startedAt);
  }

  /**
   * Track the pointer on an extra element covering the canvas (the canvas
   * controls overlay). Handles sit above the canvas, so without this the canvas
   * stops receiving pointermove as soon as one is hovered or dragged.
   */
  setPointerSurface(element) {
    if (this._pointerSurface === element) return;
    this._pointerSurface?.removeEventListener?.("pointermove", this._onMouse);
    this._pointerSurface?.removeEventListener?.(
      "pointerleave",
      this._onMouseLeave
    );
    this._pointerSurface = element || null;
    this._pointerSurface?.addEventListener?.("pointermove", this._onMouse);
    this._pointerSurface?.addEventListener?.("pointerleave", this._onMouseLeave);
  }

  _onMouse(e) {
    if (!this.active || !this.running) return;
    this._cancelMouseReset();
    const rect = this.canvas.getBoundingClientRect();
    const renderScale = this.frame.renderScale || 1;
    const sx = this.canvas.width / rect.width / renderScale;
    const sy = this.canvas.height / rect.height / renderScale;
    this.frame.mousePosition = {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    };
    this._redrawForMouse();
  }

  _onMouseLeave() {
    if (!this.active || !this.running) return;
    // Moving between the canvas and an overlay handle fires leave before the
    // next move; defer the reset so the handoff never blanks mousePosition.
    this._cancelMouseReset();
    this._mouseResetId = requestAnimationFrame(() => {
      this._mouseResetId = 0;
      this.frame.mousePosition = { x: 0, y: 0 };
      this._redrawForMouse();
    });
  }

  _cancelMouseReset() {
    if (!this._mouseResetId) return;
    cancelAnimationFrame(this._mouseResetId);
    this._mouseResetId = 0;
  }

  _redrawForMouse() {
    if (this.running && this.usesMouse && !this._isLoopActive()) this.redraw();
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
    const opts = { cssWidth, cssHeight, clearCssSize };
    if (this._captureLock > 0) {
      this._pendingSize = { w, h, opts };
      return false;
    }
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

  _setLogicalOutputSize(w, h, displayCss = null) {
    this.logicalOutputSize = {
      width: Math.max(1, Math.round(w)),
      height: Math.max(1, Math.round(h)),
    };
    this.outputCssSize = displayCss
      ? {
          width: Math.max(1, Number(displayCss.width) || 1),
          height: Math.max(1, Number(displayCss.height) || 1),
        }
      : null;
    return this._applyAdaptiveOutputSize();
  }

  _applyAdaptiveOutputSize() {
    const base = this.logicalOutputSize;
    const deviceMax = this.device?.limits?.maxTextureDimension2D || 4096;
    // Supersampling is a paused-preview quality enhancement. While playback is
    // active, render at the shader's logical size to avoid multiplying the
    // per-frame pixel workload by up to 4× at 200% zoom.
    const renderScale = this.supportsRenderScale && !this.running
      ? adaptiveRenderScale(this.previewZoom, base.width, base.height, {
          maxDimension: Math.min(4096, deviceMax),
        })
      : 1;
    const width = Math.max(1, Math.round(base.width * renderScale));
    const height = Math.max(1, Math.round(base.height * renderScale));
    const sizeChanged =
      this.canvas.width !== width || this.canvas.height !== height;
    const changed =
      sizeChanged || Math.abs((this.frame.renderScale || 1) - renderScale) > 1e-6;
    if (this._captureLock > 0) {
      this._pendingAdaptiveResize = true;
      return false;
    }
    const cssSize =
      this.outputCssSize ||
      (renderScale > 1
        ? { width: base.width, height: base.height }
        : null);

    this.setSize(
      width,
      height,
      cssSize
        ? { cssWidth: cssSize.width, cssHeight: cssSize.height }
        : { clearCssSize: true }
    );
    this.frame.renderScale = renderScale;
    if (this.canvas.dataset) {
      this.canvas.dataset.renderScale = String(renderScale);
    }
    return changed;
  }

  setPreviewZoom(zoom) {
    this.previewZoom = Math.max(0.01, Number(zoom) || 1);
    clearTimeout(this._zoomResizeTimer);
    if (!this.ready || !this.supportsRenderScale) return;
    this._zoomResizeTimer = setTimeout(() => {
      this._zoomResizeTimer = 0;
      const changed = this._applyAdaptiveOutputSize();
      if (!changed || !this.renderFn) return;
      try {
        this.resetShaderState();
      } catch (err) {
        this.onError(err && err.message ? err.message : String(err));
      }
    }, 120);
  }

  _beginCapture() {
    this._captureLock += 1;
  }

  _endCapture() {
    this._captureLock = Math.max(0, this._captureLock - 1);
    if (this._captureLock > 0) return;
    if (this._pendingSize) {
      const pending = this._pendingSize;
      this._pendingSize = null;
      this.setSize(pending.w, pending.h, pending.opts);
    }
    if (this._pendingAdaptiveResize) {
      this._pendingAdaptiveResize = false;
      const changed = this._applyAdaptiveOutputSize();
      if (changed && this.renderFn) {
        try {
          this.resetShaderState();
        } catch (err) {
          this.onError(err && err.message ? err.message : String(err));
        }
      }
    }
  }

  setStageCssSize(cssWidth, cssHeight) {
    const width = Math.max(1, cssWidth || DEFAULT_FILL_CSS);
    const height = Math.max(1, cssHeight || DEFAULT_FILL_CSS);
    this.stageCssSize = { width, height };
    if (!this.ready) return;
    if (this.isFill) {
      clearTimeout(this._fillResizeTimer);
      this._fillResizeTimer = setTimeout(() => {
        this._fillResizeTimer = 0;
        this.resizeFill(this.stageCssSize.width, this.stageCssSize.height);
      }, 80);
      return;
    }
    // HTML subjects stay at a fixed CSS size; re-sync when DPR changes.
    if (this.htmlElement && this.htmlCssSize) {
      this._syncHtmlDpi();
    }
  }

  _previewPixelRatio() {
    return previewPixelRatioForMode(this.previewPixelRatioMode);
  }

  setPreviewPixelRatioMode(mode) {
    const nextMode = normalizePreviewPixelRatioMode(mode, { allowNative: true });
    if (nextMode === this.previewPixelRatioMode) return false;
    this.previewPixelRatioMode = nextMode;
    if (!this.ready) return false;
    if (this.isFill) {
      return this.resizeFill(this.stageCssSize.width, this.stageCssSize.height);
    }
    if (this.htmlElement && this.htmlCssSize) {
      return this._syncHtmlDpi();
    }
    return false;
  }

  _syncHtmlDpi() {
    if (!this.htmlElement || !this.htmlCssSize) return false;
    const size = cssSizeToDevicePixels(
      this.htmlCssSize.width,
      this.htmlCssSize.height,
      this.maxDimension,
      this._previewPixelRatio()
    );
    if (
      this.inputTexture &&
      this.inputTexture.width === size.width &&
      this.inputTexture.height === size.height &&
      this.logicalOutputSize.width === size.width &&
      this.logicalOutputSize.height === size.height
    ) {
      return false;
    }
    const sizeChanged = this._ensureInputTexture(size.width, size.height, {
      width: size.cssWidth,
      height: size.cssHeight,
    });
    this.canvas.requestPaint?.();
    try {
      this._uploadHtmlFrame();
    } catch {
      /* wait for paint */
    }
    this._rebindAfterInputChange(sizeChanged, { resetState: true });
    return true;
  }

  _syncOutputSizeForMode() {
    if (this.isFill) {
      // A standalone fill replaces a prior effect subject. Composition source
      // fills are owned by their layer descriptors and must survive this sync.
      if (
        (this.frame.input || this.inputTexture || this.video || this.htmlElement)
      ) {
        this.clearInput();
      }
      return this.setFillSize(this.stageCssSize.width, this.stageCssSize.height);
    }
    const sourceSize = this._compositionSourceSize();
    if (
      sourceSize &&
      !this.frame.input &&
      this.logicalOutputSize.width <= 1 &&
      this.logicalOutputSize.height <= 1
    ) {
      return this._setLogicalOutputSize(sourceSize.width, sourceSize.height);
    }
    return this._applyAdaptiveOutputSize();
  }

  setFillSize(cssWidth, cssHeight) {
    const size = cssSizeToDevicePixels(
      cssWidth,
      cssHeight,
      this.maxDimension,
      this._previewPixelRatio()
    );
    return this._setLogicalOutputSize(size.width, size.height, {
      width: size.cssWidth,
      height: size.cssHeight,
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

  _destroyStateObject(state) {
    const s = state || {};
    const borrowedResources = new Set(
      [
        this.device,
        this.context,
        this.inputTexture,
        this.frame.input,
        this.frame.output,
        ...(this._compositionTextures || []),
        ...(this._compositorTextures || []),
        this._compositorTransparentTexture,
        ...(this.compositionLayers || []).flatMap((layer) => [
          layer.fillTexture,
          layer.sourceTexture,
        ]),
      ].filter(Boolean)
    );
    const destroyedResources = new Set();
    const destroy = (value) => {
      if (Array.isArray(value)) {
        for (const item of value) destroy(item);
        return;
      }
      if (!value || typeof value.destroy !== "function") return;
      if (borrowedResources.has(value) || destroyedResources.has(value)) return;
      destroyedResources.add(value);
      try {
        value.destroy();
      } catch {
        /* ignore */
      }
    };
    for (const key in s) {
      destroy(s[key]);
    }
  }

  _teardownCompositionResources() {
    for (const layer of this.compositionLayers || []) {
      this._destroyStateObject(layer.state);
      layer.state = {};
      for (const key of [
        "fillTexture",
        "sourceTexture",
        "sourceFillUniform",
      ]) {
        if (!layer[key]) continue;
        try {
          layer[key].destroy();
        } catch {
          /* ignore */
        }
        layer[key] = null;
      }
      layer.sourceUploaded = false;
    }
    for (const texture of this._compositionTextures) {
      try {
        texture.destroy();
      } catch {
        /* ignore */
      }
    }
    this._compositionTextures = [];
    for (const texture of this._compositorTextures) {
      try {
        texture.destroy();
      } catch {
        /* ignore */
      }
    }
    this._compositorTextures = [];
    if (this._compositorTransparentTexture) {
      try {
        this._compositorTransparentTexture.destroy();
      } catch {
        /* ignore */
      }
      this._compositorTransparentTexture = null;
    }
    this._compositorPipelines.clear();
    this._compositorSampler = null;
    this._compositorBindLayout = null;
    this._sourceFillPipelines.clear();
    this._sourceFillSampler = null;
    this._sourceFillBindLayout = null;
  }

  _teardownState() {
    this._teardownCompositionResources();
    this._destroyStateObject(this.frame.state);
    this.frame.state = {};
  }

  _clearInputResources() {
    this._unbindHtmlPaint();
    this._cancelVideoFrameCallback();
    if (this.inputTexture) {
      this.inputTexture.destroy();
      this.inputTexture = null;
    }
    this.video = null;
    this.htmlElement = null;
    this.htmlCssSize = null;
    this._htmlFrameDirty = false;
    this._videoFrameDirty = false;
    this._lastVideoTime = -1;
    this._passthroughBindGroup = null;
    this._passthroughInputTexture = null;
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
      if (this.video) this._videoFrameDirty = true;
      if (this.htmlElement) this._htmlFrameDirty = true;
      this._passthroughBindGroup = null;
      this._passthroughInputTexture = null;
    }
    this.frame.input = this.inputTexture;
    const sizeChanged = this._setLogicalOutputSize(w, h, displayCss);
    return textureChanged || sizeChanged;
  }

  // After input size changes, rebuild shader state (many effects size
  // resources from setup) and present immediately — including when paused.
  _rebindAfterInputChange(sizeChanged, { resetState = false } = {}) {
    if (!this.ready || !this.renderFn) return;
    if (sizeChanged || resetState) {
      this._teardownState();
      if (resetState) {
        this.frame.time = 0;
        this.frame.deltaTime = 0;
        this.frame.frame = 0;
        this.startTime = performance.now();
        this.lastTime = this.startTime;
      }
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
    const scale = Math.min(1, this.maxDimension / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    const sizeChanged = this._ensureInputTexture(w, h);
    this.device.queue.copyExternalImageToTexture(
      { source, flipY: false },
      { texture: this.inputTexture, premultipliedAlpha: true },
      [w, h]
    );
    this._rebindAfterInputChange(sizeChanged, { resetState: true });
  }

  setVideoInput(video) {
    this._clearInputResources();
    this.video = video;
    const w = Math.min(this.maxDimension, video.videoWidth || 1024);
    const h = Math.min(this.maxDimension, video.videoHeight || 1024);
    const sizeChanged = this._ensureInputTexture(w, h);
    this._videoFrameDirty = true;
    this._uploadVideoFrame();
    this._rebindAfterInputChange(sizeChanged, { resetState: true });
    if (!this.active || !this.running) {
      video.pause?.();
      return;
    }
    this._watchVideoFrames();
    Promise.resolve(video.play?.()).catch(() => {});
    this._scheduleLoop();
  }

  // Replace the contents of an existing image input without changing texture
  // identity or shader state. Video export uses this to preserve temporal
  // accumulators while supplying one decoded source frame at a time.
  updateImageInput(source) {
    if (!source || !this.inputTexture) return false;
    this.device.queue.copyExternalImageToTexture(
      { source, flipY: false },
      { texture: this.inputTexture, premultipliedAlpha: true },
      [this.inputTexture.width, this.inputTexture.height]
    );
    return true;
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
    this._htmlFrameDirty = true;
    const size = cssSizeToDevicePixels(
      cssWidth,
      cssHeight,
      this.maxDimension,
      this._previewPixelRatio()
    );
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
    this._rebindAfterInputChange(sizeChanged, { resetState: true });
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
    if (!this.active) return;
    try {
      this._htmlFrameDirty = true;
      if (this.renderFn && (!this.running || !this.isAnimated)) {
        this._present();
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
    if (
      !this._videoFrameDirty &&
      Number.isFinite(video.currentTime) &&
      video.currentTime === this._lastVideoTime
    ) {
      return false;
    }
    try {
      this.device.queue.copyExternalImageToTexture(
        { source: video, flipY: false },
        { texture: this.inputTexture, premultipliedAlpha: true },
        [this.inputTexture.width, this.inputTexture.height]
      );
      this._videoFrameDirty = false;
      this._lastVideoTime = video.currentTime;
      recordPerf("input.videoUpload");
      return true;
    } catch {
      // Skip frames that aren't importable yet (no backing resource).
      return false;
    }
  }

  _watchVideoFrames() {
    const video = this.video;
    if (!video) return;
    if (typeof video.requestVideoFrameCallback !== "function") {
      this._videoPollId = setInterval(() => {
        if (this.video !== video || !this.running) return;
        if (
          Number.isFinite(video.currentTime) &&
          video.currentTime === this._lastVideoTime
        ) {
          return;
        }
        this._videoFrameDirty = true;
        if (this.active && this.renderFn && !this._isLoopActive()) {
          this.redraw();
        }
      }, 1000 / 30);
      return;
    }
    const markDirty = () => {
      if (this.video !== video || !this.running) return;
      this._videoFrameDirty = true;
      // The RAF loop normally presents while running. If it is temporarily
      // unavailable, render exactly once for the decoded video frame.
      if (this.active && this.renderFn && !this._isLoopActive()) {
        this.redraw();
      }
      this._videoFrameCallbackId = video.requestVideoFrameCallback(markDirty);
    };
    this._videoFrameCallbackId = video.requestVideoFrameCallback(markDirty);
  }

  _cancelVideoFrameCallback() {
    if (this._videoPollId) {
      clearInterval(this._videoPollId);
      this._videoPollId = 0;
    }
    if (
      this.video &&
      this._videoFrameCallbackId &&
      typeof this.video.cancelVideoFrameCallback === "function"
    ) {
      this.video.cancelVideoFrameCallback(this._videoFrameCallbackId);
    }
    this._videoFrameCallbackId = 0;
  }

  _uploadHtmlFrame() {
    if (!this.htmlElement || !this.inputTexture) return;
    if (!this._htmlFrameDirty) return false;
    const copied = this._copyElementImageToTexture(
      this.htmlElement,
      this.inputTexture
    );
    if (copied) {
      this._htmlFrameDirty = false;
      recordPerf("input.htmlUpload");
    }
    return copied;
  }

  _copyElementImageToTexture(element, texture) {
    const queue = this.device.queue;
    const width = texture.width;
    const height = texture.height;
    // Chrome 150+: dictionary form with nested destination.texture.
    // Older builds accepted (element, { texture }) or (element, w, h, { texture }).
    try {
      queue.copyElementImageToTexture(
        { source: element },
        {
          destination: { texture, premultipliedAlpha: true },
          width,
          height,
        }
      );
      return true;
    } catch {
      /* try legacy signatures below */
    }
    try {
      queue.copyElementImageToTexture(element, {
        texture,
        premultipliedAlpha: true,
      });
      return true;
    } catch {
      /* try older 4-arg form */
    }
    try {
      queue.copyElementImageToTexture(element, width, height, {
        texture,
        premultipliedAlpha: true,
      });
      return true;
    } catch {
      // Skip until a paint snapshot exists / API is available.
      return false;
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
    if (!this._isLoopActive()) this.redraw();
  }

  setCompositionLayerParams(layerId, params) {
    const layer = (this.compositionLayers || []).find(
      (item) => item.id === layerId
    );
    if (!layer) return;
    layer.params = params || {};
    if (!this._isLoopActive()) this.redraw();
  }

  setEffectVisible(visible) {
    this.effectVisible = Boolean(visible);
    this.redraw();
  }

  redraw() {
    if (!this.active || !this.ready || !this.renderFn) return;
    try {
      this._present();
    } catch (err) {
      this.onError(err && err.message ? err.message : String(err));
    }
  }

  compositionExportVideo() {
    const layer = (this.compositionLayers || []).find(
      (item) =>
        item.role === "fill" &&
        item.enabled !== false &&
        item.sourceType === "video" &&
        item.source &&
        (item.source.currentSrc || item.source.src)
    );
    if (layer?.source) return layer.source;
    const legacy = this.video;
    if (legacy && (legacy.currentSrc || legacy.src) && !legacy.srcObject) {
      return legacy;
    }
    return null;
  }

  _compositionSourceFillLayer() {
    return (this.compositionLayers || []).find(
      (layer) => layer.enabled !== false && this._isSourceFill(layer)
    ) || null;
  }

  async _bitmapFromImageData(imageData, width, height) {
    if (!imageData) return null;
    const srcW = imageData.width;
    const srcH = imageData.height;
    const targetW = Math.max(1, Math.round(width || srcW));
    const targetH = Math.max(1, Math.round(height || srcH));
    const scale = Math.max(targetW / srcW, targetH / srcH);
    const cropW = Math.max(1, targetW / scale);
    const cropH = Math.max(1, targetH / scale);
    return createImageBitmap(
      imageData,
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
  }

  async _bitmapFromExternalSource(source, width, height) {
    if (!source || typeof createImageBitmap !== "function") return null;
    try {
      const srcW = Number(
        source.videoWidth ||
          source.naturalWidth ||
          source.displayWidth ||
          source.width ||
          0
      );
      const srcH = Number(
        source.videoHeight ||
          source.naturalHeight ||
          source.displayHeight ||
          source.height ||
          0
      );
      const targetW = Math.max(1, Math.round(width || srcW || 1));
      const targetH = Math.max(1, Math.round(height || srcH || 1));
      if (srcW > 0 && srcH > 0) {
        const scale = Math.max(targetW / srcW, targetH / srcH);
        const cropW = Math.max(1, targetW / scale);
        const cropH = Math.max(1, targetH / scale);
        return await createImageBitmap(
          source,
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
      }
      return await createImageBitmap(source, {
        resizeWidth: targetW,
        resizeHeight: targetH,
        resizeQuality: "high",
      });
    } catch {
      return null;
    }
  }

  async captureInputBitmap({ width, height } = {}) {
    if (!this.ready) return null;
    if (this.video) {
      this._videoFrameDirty = true;
      this._uploadVideoFrame();
    }
    if (this.htmlElement) {
      this._htmlFrameDirty = true;
      this._uploadHtmlFrame();
    }

    const targetW = Math.max(1, Math.round(Number(width) || 0));
    const targetH = Math.max(1, Math.round(Number(height) || 0));
    const sourceLayer = this._compositionSourceFillLayer();
    if (sourceLayer?.source && sourceLayer.sourceType !== "video") {
      const cloned = await this._bitmapFromExternalSource(
        sourceLayer.source,
        targetW || sourceLayer.source.width,
        targetH || sourceLayer.source.height
      );
      if (cloned) return cloned;
      if (this.renderFn) {
        try {
          this._present();
        } catch {
          /* keep looking at whatever fill texture already exists */
        }
      }
      const texture = sourceLayer.fillTexture || sourceLayer.sourceTexture;
      if (texture) {
        const imageData = await this.readbackTextureImageData(texture);
        const bitmap = await this._bitmapFromImageData(
          imageData,
          targetW || texture.width,
          targetH || texture.height
        );
        if (bitmap) return bitmap;
      }
    }

    if (!this.inputTexture) return null;
    const imageData = await this.readbackTextureImageData(this.inputTexture);
    return this._bitmapFromImageData(
      imageData,
      targetW || this.inputTexture.width,
      targetH || this.inputTexture.height
    );
  }

  /**
   * Encode a 2D canvas to a blob, falling back when the requested type is
   * unsupported (e.g. WebP encode returning null in some browsers).
   */
  async _canvasToBlob(canvas, type = "image/webp", quality = 0.85) {
    const candidates = [type, "image/png", "image/jpeg"].filter(
      (value, index, list) => value && list.indexOf(value) === index
    );
    for (const candidate of candidates) {
      const blob = await new Promise((resolve) => {
        try {
          canvas.toBlob(
            (result) => resolve(result || null),
            candidate,
            quality
          );
        } catch {
          resolve(null);
        }
      });
      if (blob) return blob;
    }
    throw new Error("Could not encode the preview image.");
  }

  /**
   * Read a presented WebGPU texture into ImageData. Copy off the swapchain
   * first so a later present cannot cancel the map.
   */
  async readbackTextureImageData(texture) {
    if (!this.ready || !this.device || !texture) return null;

    const srcW = texture.width;
    const srcH = texture.height;
    const bytesPerPixel = 4;
    const bytesPerRow = Math.ceil((srcW * bytesPerPixel) / 256) * 256;
    const bufferSize = bytesPerRow * srcH;
    const maxBufferSize = this.device.limits?.maxBufferSize;
    if (maxBufferSize && bufferSize > maxBufferSize) {
      throw new Error(
        `Preview is too large to export (${srcW}×${srcH}). Try a smaller stage size.`
      );
    }

    let readbackBuffer = null;
    let staging = null;
    try {
      staging = this.device.createTexture({
        size: [srcW, srcH],
        format: this.format,
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
      });
      const copyEncoder = this.device.createCommandEncoder();
      copyEncoder.copyTextureToTexture(
        { texture },
        { texture: staging },
        [srcW, srcH]
      );
      this.device.queue.submit([copyEncoder.finish()]);
      await this.device.queue.onSubmittedWorkDone();

      readbackBuffer = this.device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = this.device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture: staging },
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
      staging.destroy();
      staging = null;
      return new ImageData(packed, srcW, srcH);
    } finally {
      if (readbackBuffer) {
        try {
          readbackBuffer.destroy();
        } catch {
          /* ignore */
        }
      }
      if (staging) {
        try {
          staging.destroy();
        } catch {
          /* ignore */
        }
      }
    }
  }

  /**
   * Snapshot the current preview into an image blob (default 512² cover crop).
   * Reads pixels via copyTextureToBuffer — WebGPU canvas 2D drawImage often
   * returns a cleared/black frame once the browser has composited.
   */
  async captureThumbnailBlob({
    width = 512,
    height = 512,
    type = "image/webp",
    quality = 0.85,
    shouldResume = () => true,
  } = {}) {
    if (!this.ready || !this.canvas?.width || !this.canvas?.height) return null;
    if (!this.renderFn) return null;

    const wasRunning = this.running;
    const playbackGeneration = this._playbackGeneration;
    this._beginCapture();
    try {
      if (wasRunning) this.pause();

      const texture = this._present();
      const imageData = await this.readbackTextureImageData(texture);
      if (!imageData) return null;
      const srcW = imageData.width;
      const srcH = imageData.height;

      const source = document.createElement("canvas");
      source.width = srcW;
      source.height = srcH;
      source.getContext("2d").putImageData(imageData, 0, 0);

      const thumb = document.createElement("canvas");
      thumb.width = width;
      thumb.height = height;
      const ctx = thumb.getContext("2d");
      if (!ctx) throw new Error("Could not create an export canvas.");

      const scale = Math.max(width / srcW, height / srcH);
      const dw = srcW * scale;
      const dh = srcH * scale;
      ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);

      return await this._canvasToBlob(thumb, type, quality);
    } finally {
      this._endCapture();
      // Resume from the caller's play intent. A newer setModule bumps the
      // generation during capture; if that compile's start() already ran we
      // leave it alone, otherwise bridge the gap so play preference and the
      // host loop cannot diverge (UI play-on / host stopped).
      // Avoid bare `return` here — it would swallow errors thrown above.
      if (
        shouldResume() &&
        this.renderFn &&
        (playbackGeneration === this._playbackGeneration || !this.running) &&
        !this._isLoopActive()
      ) {
        this.start();
      }
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
    if (
      !this._passthroughBindGroup ||
      this._passthroughInputTexture !== this.frame.input
    ) {
      this._passthroughBindGroup = this.device.createBindGroup({
        layout: this._passthroughBindLayout,
        entries: [
          { binding: 0, resource: this._passthroughSampler },
          { binding: 1, resource: this.frame.input.createView() },
        ],
      });
      this._passthroughInputTexture = this.frame.input;
    }
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
    pass.setBindGroup(0, this._passthroughBindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return output;
  }

  _present() {
    const startedAt = perfNow();
    if (this.video) this._uploadVideoFrame();
    if (this.htmlElement) this._uploadHtmlFrame();
    this.frame.output = this.context.getCurrentTexture();
    if (this.compositionLayers) {
      const output = this._presentComposition();
      this.presentedFrames += 1;
      measurePerf("host.present", startedAt);
      return output;
    }
    if (!this.effectVisible) {
      const output = this._presentPassthrough();
      this.presentedFrames += 1;
      measurePerf("host.present", startedAt);
      return output;
    }
    this.renderFn(this.device, this.frame);
    this.presentedFrames += 1;
    measurePerf("host.present", startedAt);
    return this.frame.output;
  }

  _isSourceFill(layer) {
    return Boolean(
      layer?.role === "fill" &&
        layer.source &&
        SOURCE_FILL_TYPES.has(layer.sourceType)
    );
  }

  _sourceDimensions(source) {
    if (!source) return null;
    let width = Number(
      source.videoWidth ||
        source.naturalWidth ||
        source.displayWidth ||
        source.offsetWidth ||
        source.clientWidth ||
        source.width
    );
    let height = Number(
      source.videoHeight ||
        source.naturalHeight ||
        source.displayHeight ||
        source.offsetHeight ||
        source.clientHeight ||
        source.height
    );
    if (!(width > 0 && height > 0)) return null;
    const scale = Math.min(1, this.maxDimension / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    return { width, height };
  }

  _compositionSourceSize() {
    for (const layer of this.compositionLayers || []) {
      if (layer.enabled === false || !this._isSourceFill(layer)) continue;
      const size = this._sourceDimensions(layer.source);
      if (size) return size;
    }
    return null;
  }

  _syncCompositionSourcePlayback(
    shouldPlay = this.active && this.running
  ) {
    for (const layer of this.compositionLayers || []) {
      if (
        !this._isSourceFill(layer) ||
        (layer.sourceType !== "video" && layer.sourceType !== "webcam")
      ) {
        continue;
      }
      if (shouldPlay && layer.enabled !== false) {
        Promise.resolve(layer.source?.play?.()).catch(() => {});
      } else {
        layer.source?.pause?.();
      }
    }
  }

  _seekMediaElement(media, time) {
    if (
      !media ||
      typeof media.addEventListener !== "function" ||
      !Number.isFinite(media.currentTime)
    ) {
      return false;
    }
    const seconds = Math.max(0, Number(time) || 0) / 1000;
    const duration = Number(media.duration);
    const target =
      Number.isFinite(duration) && duration > 0 ? seconds % duration : seconds;
    if (Math.abs(media.currentTime - target) <= 0.0005) return false;

    const version = (this._mediaSeekVersions.get(media) || 0) + 1;
    this._mediaSeekVersions.set(media, version);
    const onSeeked = () => {
      if (this._mediaSeekVersions.get(media) !== version || this.running) return;
      this._scheduleSeekPresent();
    };
    media.addEventListener("seeked", onSeeked, { once: true });
    try {
      media.currentTime = target;
    } catch {
      media.removeEventListener?.("seeked", onSeeked);
      return false;
    }
    return true;
  }

  _seekMediaToTime(time) {
    this._seekMediaElement(this.video, time);
    const seen = new Set();
    for (const layer of this.compositionLayers || []) {
      if (layer.sourceType !== "video" || seen.has(layer.source)) continue;
      seen.add(layer.source);
      this._seekMediaElement(layer.source, time);
    }
  }

  _textureUsage({ copyDestination = false } = {}) {
    return (
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.RENDER_ATTACHMENT |
      (copyDestination ? GPUTextureUsage.COPY_DST : 0)
    );
  }

  _ensureLayerTexture(
    layer,
    key,
    width,
    height,
    { copyDestination = false } = {}
  ) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const existing = layer[key];
    if (
      existing &&
      existing.width === w &&
      existing.height === h &&
      existing.format === this.format
    ) {
      return existing;
    }
    if (existing) {
      try {
        existing.destroy();
      } catch {
        /* ignore */
      }
    }
    const texture = this.device.createTexture({
      size: [w, h],
      format: this.format,
      usage: this._textureUsage({ copyDestination }),
    });
    layer[key] = texture;
    if (key === "sourceTexture") layer.sourceUploaded = false;
    return texture;
  }

  _ensureCompositionTexture(index, width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const existing = this._compositionTextures[index];
    if (
      existing &&
      existing.width === w &&
      existing.height === h &&
      existing.format === this.format
    ) {
      return existing;
    }
    if (existing) {
      try {
        existing.destroy();
      } catch {
        /* ignore */
      }
    }
    const texture = this.device.createTexture({
      size: [w, h],
      format: this.format,
      usage: this._textureUsage(),
    });
    this._compositionTextures[index] = texture;
    return texture;
  }

  _ensureCompositorTexture(index, width, height) {
    const holder = { texture: this._compositorTextures[index] };
    const texture = this._ensureLayerTexture(
      holder,
      "texture",
      width,
      height
    );
    this._compositorTextures[index] = texture;
    return texture;
  }

  _ensureTransparentTexture(width, height) {
    const holder = { texture: this._compositorTransparentTexture };
    const existing = holder.texture;
    const texture = this._ensureLayerTexture(
      holder,
      "texture",
      width,
      height
    );
    this._compositorTransparentTexture = texture;
    if (texture !== existing) {
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: texture.createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      });
      pass.end();
      this.device.queue.submit([encoder.finish()]);
    }
    return texture;
  }

  _ensureCompositorPipeline(format) {
    if (
      this._compositorPipelines.has(format) &&
      this._compositorSampler &&
      this._compositorBindLayout
    ) {
      return this._compositorPipelines.get(format);
    }
    if (!this._compositorBindLayout) {
      this._compositorBindLayout = this.device.createBindGroupLayout({
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
          {
            binding: 2,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float" },
          },
        ],
      });
      this._compositorSampler = this.device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
      });
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

@group(0) @binding(0) var linearSampler: sampler;
@group(0) @binding(1) var baseTexture: texture_2d<f32>;
@group(0) @binding(2) var overlayTexture: texture_2d<f32>;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  let base = textureSample(baseTexture, linearSampler, in.uv);
  let overlay = textureSample(overlayTexture, linearSampler, in.uv);
  return overlay + base * (1.0 - overlay.a);
}
`,
    });
    const pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this._compositorBindLayout],
      }),
      vertex: { module, entryPoint: "vs_main" },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    });
    this._compositorPipelines.set(format, pipeline);
    return pipeline;
  }

  _encodeComposite(encoder, base, overlay, target) {
    if (base === target || overlay === target) {
      throw new Error("Composition pass cannot sample from its render target.");
    }
    const format = target.format || this.format;
    const pipeline = this._ensureCompositorPipeline(format);
    const bindGroup = this.device.createBindGroup({
      layout: this._compositorBindLayout,
      entries: [
        { binding: 0, resource: this._compositorSampler },
        { binding: 1, resource: base.createView() },
        { binding: 2, resource: overlay.createView() },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  _sourceFillTransform(layer, sourceSize, targetSize) {
    const sourceRatio =
      Math.max(1, sourceSize?.width || 1) /
      Math.max(1, sourceSize?.height || 1);
    const targetRatio =
      Math.max(1, targetSize?.width || 1) /
      Math.max(1, targetSize?.height || 1);
    const mode = layer?.sourceScaleMode === "fit" ? "fit" : "cover";
    let scaleX = 1;
    let scaleY = 1;

    if (mode === "fit") {
      if (sourceRatio > targetRatio) scaleY = sourceRatio / targetRatio;
      else scaleX = targetRatio / sourceRatio;
    } else if (sourceRatio > targetRatio) {
      scaleX = targetRatio / sourceRatio;
    } else {
      scaleY = sourceRatio / targetRatio;
    }

    const rawOpacity = Number(layer?.sourceOpacity);
    const normalizedOpacity = Number.isFinite(rawOpacity)
      ? rawOpacity > 1
        ? rawOpacity / 100
        : rawOpacity
      : 1;
    return {
      scale: [scaleX, scaleY],
      offset: [(1 - scaleX) / 2, (1 - scaleY) / 2],
      opacity: Math.min(1, Math.max(0, normalizedOpacity)),
    };
  }

  _ensureSourceFillPipeline(format) {
    if (
      this._sourceFillPipelines.has(format) &&
      this._sourceFillSampler &&
      this._sourceFillBindLayout
    ) {
      return this._sourceFillPipelines.get(format);
    }
    if (!this._sourceFillBindLayout) {
      this._sourceFillBindLayout = this.device.createBindGroupLayout({
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
          {
            binding: 2,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform", minBindingSize: 32 },
          },
        ],
      });
      this._sourceFillSampler = this.device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
      });
    }
    const module = this.device.createShaderModule({
      code: `
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

struct SourceFillParams {
  uvScale: vec2f,
  uvOffset: vec2f,
  opacityAndPadding: vec4f,
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

@group(0) @binding(0) var linearSampler: sampler;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: SourceFillParams;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  let sourceUv = in.uv * params.uvScale + params.uvOffset;
  let sampled = textureSample(sourceTexture, linearSampler, sourceUv);
  let inside = all(sourceUv >= vec2f(0.0)) && all(sourceUv <= vec2f(1.0));
  if (!inside) {
    return vec4f(0.0);
  }
  return sampled * params.opacityAndPadding.x;
}
`,
    });
    const pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this._sourceFillBindLayout],
      }),
      vertex: { module, entryPoint: "vs_main" },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    });
    this._sourceFillPipelines.set(format, pipeline);
    return pipeline;
  }

  _encodeSourceFill(encoder, layer, sourceTexture, target) {
    if (!layer.sourceFillUniform) {
      layer.sourceFillUniform = this.device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    const transform = this._sourceFillTransform(
      layer,
      { width: sourceTexture.width, height: sourceTexture.height },
      { width: target.width, height: target.height }
    );
    this.device.queue.writeBuffer(
      layer.sourceFillUniform,
      0,
      new Float32Array([
        ...transform.scale,
        ...transform.offset,
        transform.opacity,
        0,
        0,
        0,
      ])
    );
    const pipeline = this._ensureSourceFillPipeline(
      target.format || this.format
    );
    const bindGroup = this.device.createBindGroup({
      layout: this._sourceFillBindLayout,
      entries: [
        { binding: 0, resource: this._sourceFillSampler },
        { binding: 1, resource: sourceTexture.createView() },
        { binding: 2, resource: { buffer: layer.sourceFillUniform } },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  _clearRenderTarget(target) {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  _layerFrame(layer, input, output) {
    return {
      input,
      output,
      state: layer.state,
      params: layer.params || {},
      time: this.frame.time,
      deltaTime: this.frame.deltaTime,
      frame: this.frame.frame,
      renderScale: this.frame.renderScale,
      mousePosition: this.frame.mousePosition,
      audio: this.frame.audio,
    };
  }

  _sourceIsReady(layer) {
    const source = layer.source;
    if (!source) return false;
    if (
      (layer.sourceType === "video" || layer.sourceType === "webcam") &&
      Number.isFinite(source.readyState)
    ) {
      const haveCurrentData =
        globalThis.HTMLMediaElement?.HAVE_CURRENT_DATA ?? 2;
      if (source.readyState < haveCurrentData) return false;
    }
    if (layer.sourceType === "image" && source.complete === false) return false;
    return Boolean(this._sourceDimensions(source));
  }

  _prepareSourceFill(layer, width, height) {
    const fillTexture = this._ensureLayerTexture(
      layer,
      "fillTexture",
      width,
      height
    );
    const sourceSize = this._sourceDimensions(layer.source) || {
      width,
      height,
    };
    const sourceTexture = this._ensureLayerTexture(
      layer,
      "sourceTexture",
      sourceSize.width,
      sourceSize.height,
      { copyDestination: true }
    );
    const dynamic =
      layer.sourceType === "video" ||
      layer.sourceType === "webcam" ||
      layer.sourceType === "html";
    if (
      this._sourceIsReady(layer) &&
      (dynamic || !layer.sourceUploaded)
    ) {
      if (layer.sourceType === "html") {
        layer.sourceUploaded = this._copyElementImageToTexture(
          layer.source,
          sourceTexture
        );
      } else {
        try {
          this.device.queue.copyExternalImageToTexture(
            { source: layer.source, flipY: false },
            { texture: sourceTexture, premultipliedAlpha: true },
            [sourceTexture.width, sourceTexture.height]
          );
          layer.sourceUploaded = true;
        } catch {
          // A media element can report ready before its backing frame is
          // importable. Keep the previous texture and try again next present.
        }
      }
    }
    return { layer, fillTexture, sourceTexture };
  }

  _compositionSize(swapchain, fills) {
    if (!fills.length && this.frame.input) {
      return {
        width: this.frame.input.width,
        height: this.frame.input.height,
      };
    }
    const sourceSize = this._compositionSourceSize();
    const logical = this.logicalOutputSize;
    const hasLogicalSize = logical.width > 1 || logical.height > 1;
    return {
      width:
        (hasLogicalSize && logical.width) ||
        sourceSize?.width ||
        swapchain.width,
      height:
        (hasLogicalSize && logical.height) ||
        sourceSize?.height ||
        swapchain.height,
    };
  }

  _presentComposition() {
    const swapchain = this.context.getCurrentTexture();
    this.frame.output = swapchain;
    const layers = this.compositionLayers || [];
    const fills = layers.filter(
      (layer) => layer.role === "fill" && layer.enabled
    );
    const effects = this.effectVisible
      ? layers.filter((layer) => layer.role === "effect" && layer.enabled)
      : [];
    const { width, height } = this._compositionSize(swapchain, fills);
    const transparent = fills.length
      ? this._ensureTransparentTexture(width, height)
      : null;
    const sourceFills = [];
    const fillTextures = [];

    for (const layer of fills) {
      if (this._isSourceFill(layer)) {
        const prepared = this._prepareSourceFill(layer, width, height);
        sourceFills.push(prepared);
        fillTextures.push(prepared.fillTexture);
        continue;
      }
      if (typeof layer.render !== "function") continue;
      const target = this._ensureLayerTexture(
        layer,
        "fillTexture",
        width,
        height
      );
      layer.render(this.device, this._layerFrame(layer, null, target));
      fillTextures.push(target);
    }

    let current = fillTextures.length ? fillTextures[0] : this.frame.input;
    if (fillTextures.length) {
      const encoder = this.device.createCommandEncoder();
      for (const { layer, fillTexture, sourceTexture } of sourceFills) {
        this._encodeSourceFill(encoder, layer, sourceTexture, fillTexture);
      }
      for (let index = 1; index < fillTextures.length; index += 1) {
        const target = this._ensureCompositorTexture(
          (index - 1) % 2,
          width,
          height
        );
        this._encodeComposite(
          encoder,
          current,
          fillTextures[index],
          target
        );
        current = target;
      }
      if (!effects.length) {
        this._encodeComposite(encoder, transparent, current, swapchain);
      }
      this.device.queue.submit([encoder.finish()]);
    }

    if (!effects.length) {
      return fillTextures.length ? swapchain : this._presentPassthrough();
    }

    effects.forEach((layer, index) => {
      const isLast = index === effects.length - 1;
      const target = isLast
        ? swapchain
        : this._ensureCompositionTexture(index % 2, width, height);
      if (!current) {
        this._clearRenderTarget(target);
        current = target;
        return;
      }
      const frame = this._layerFrame(layer, current, target);
      layer.render(this.device, frame);
      current = target;
    });
    return swapchain;
  }

  async setComposition(
    layers,
    { isFill, isAnimated, usesMouse, supportsRenderScale, supportsAudio } = {}
  ) {
    this._playbackGeneration += 1;
    this._shaderCompilationErrorMessage = null;
    this._syncCompositionSourcePlayback(false);
    this._teardownState();
    this.compositionLayers = (layers || []).map((layer) => ({
      ...layer,
      state: {},
      enabled: layer.enabled !== false,
      params: layer.params || {},
      fillTexture: null,
      sourceTexture: null,
      sourceFillUniform: null,
      sourceUploaded: false,
    }));
    this._syncCompositionSourcePlayback();
    this.setupFn = (device, frame) => {
      const fills = this.compositionLayers.filter(
        (layer) => layer.role === "fill" && layer.enabled
      );
      const size = this._compositionSize(frame.output, fills);
      for (const layer of this.compositionLayers) {
        if (!layer.enabled || typeof layer.setup !== "function") continue;
        const isFillLayer = layer.role === "fill";
        const output = isFillLayer
          ? this._ensureLayerTexture(
              layer,
              "fillTexture",
              size.width,
              size.height
            )
          : frame.output;
        const layerFrame = this._layerFrame(
          layer,
          isFillLayer ? null : frame.input,
          output
        );
        layer.setup?.(device, layerFrame);
      }
    };
    this.renderFn = () => this._presentComposition();
    this.isFill = Boolean(isFill);
    this.isAnimated = Boolean(isAnimated);
    this.usesMouse = Boolean(usesMouse);
    this.supportsRenderScale = Boolean(supportsRenderScale);
    this.supportsAudio = Boolean(supportsAudio);
    this.frame.frame = 0;
    this.startTime = performance.now();
    this.lastTime = this.startTime;

    this._syncOutputSizeForMode();

    this.device.pushErrorScope("validation");
    let jsError = null;
    try {
      this.frame.output = this.context.getCurrentTexture();
      const setupStartedAt = perfNow();
      if (this.setupFn) this.setupFn(this.device, this.frame);
      measurePerf("shader.setup", setupStartedAt);
      this._present();
    } catch (err) {
      jsError = err && err.message ? err.message : String(err);
    }
    const shaderCompilationError = await this._shaderCompilationError();
    const gpuError = await this.device.popErrorScope();

    if (jsError) {
      this._disableRejectedModule();
      this.onError(jsError);
      return false;
    }
    if (shaderCompilationError) {
      this._shaderCompilationErrorMessage = shaderCompilationError;
      this._disableRejectedModule();
      this.onError(shaderCompilationError);
      return false;
    }
    if (gpuError) {
      this._disableRejectedModule();
      this.onError(gpuError.message);
      return false;
    }
    this.onError(null);
    return true;
  }

  async setModule(
    { setup, render },
    { isFill, isAnimated, usesMouse, supportsRenderScale, supportsAudio } = {}
  ) {
    this._playbackGeneration += 1;
    this._shaderCompilationErrorMessage = null;
    this._syncCompositionSourcePlayback(false);
    this._teardownState();
    this.compositionLayers = null;
    this.setupFn = setup;
    this.renderFn = render;
    this.isFill = Boolean(isFill);
    this.isAnimated = Boolean(isAnimated);
    this.usesMouse = Boolean(usesMouse);
    this.supportsRenderScale = Boolean(supportsRenderScale);
    this.supportsAudio = Boolean(supportsAudio);
    this.frame.frame = 0;
    this.startTime = performance.now();
    this.lastTime = this.startTime;

    // Fills have no input — size the target to the preview stage at device DPI.
    this._syncOutputSizeForMode();

    this.device.pushErrorScope("validation");
    let jsError = null;
    try {
      this.frame.output = this.context.getCurrentTexture();
      const setupStartedAt = perfNow();
      if (this.setupFn) this.setupFn(this.device, this.frame);
      measurePerf("shader.setup", setupStartedAt);
      this._present();
    } catch (err) {
      jsError = err && err.message ? err.message : String(err);
    }
    const shaderCompilationError = await this._shaderCompilationError();
    const gpuError = await this.device.popErrorScope();

    if (jsError) {
      this._disableRejectedModule();
      this.onError(jsError);
      return false;
    }
    if (shaderCompilationError) {
      this._shaderCompilationErrorMessage = shaderCompilationError;
      this._disableRejectedModule();
      this.onError(shaderCompilationError);
      return false;
    }
    if (gpuError) {
      this._disableRejectedModule();
      this.onError(gpuError.message);
      return false;
    }
    this.onError(null);
    return true;
  }

  _disableRejectedModule() {
    this.running = false;
    this._playbackGeneration += 1;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this._cancelVideoFrameCallback();
    this._syncCompositionSourcePlayback();
    this._teardownState();
    this.setupFn = null;
    this.renderFn = null;
    this.compositionLayers = null;
  }

  async _shaderCompilationError() {
    const modules = [];
    collectShaderModules(this.frame.state, modules, new Set());
    for (const layer of this.compositionLayers || []) {
      collectShaderModules(layer.state, modules, new Set());
    }
    const errors = [];
    for (const module of modules) {
      try {
        const info = await module.getCompilationInfo();
        for (const message of info?.messages || []) {
          if (message?.type === "error") {
            errors.push(formatShaderCompilationMessage(message));
          }
        }
      } catch {
        // Older implementations may expose the method without supporting it.
      }
    }
    return errors.length ? errors.join("\n") : null;
  }

  resetShaderState({ present = true } = {}) {
    if (!this.ready || !this.renderFn) return false;
    this._teardownState();
    this.frame.time = 0;
    this.frame.deltaTime = 0;
    this.frame.frame = 0;
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    zeroAudioFrame(this.frame.audio);
    this.frame.output = this.context.getCurrentTexture();
    if (this.setupFn) this.setupFn(this.device, this.frame);
    if (present) this._present();
    return true;
  }

  start() {
    if (!this.renderFn) return;
    this._cancelSeekPresent();
    this.running = true;
    const sizeChanged =
      this.supportsRenderScale && this._applyAdaptiveOutputSize();
    if (sizeChanged && this.ready) {
      this.resetShaderState({ present: false });
    }
    if (this.active && this.video) {
      this._videoFrameDirty = true;
      this._watchVideoFrames();
      Promise.resolve(this.video.play?.()).catch(() => {});
    }
    this._syncCompositionSourcePlayback();
    this._audioBus?.resume?.();
    const now = performance.now();
    // Resume from the current frame clock so pause/resume and temporary
    // stop()/start() pairs (thumbnail capture) continue from the same time.
    this.startTime = now - (Number(this.frame.time) || 0);
    this.lastTime = now;
    if (this._needsAnimationFrame()) {
      this._scheduleLoop();
    } else {
      this.redraw();
    }
  }

  play() {
    this.start();
  }

  pause() {
    this.stop({ resetTime: false });
  }

  /**
   * Jump the shader clock to `time` milliseconds. Playback continues from
   * the new time if already running. When paused, pass `{ present: "frame" }`
   * to show the latest time on the next animation frame so scrubbing does not
   * block pointer input with a GPU present per event.
   */
  seek(time, { present = "sync" } = {}) {
    const next = Math.max(0, Number(time) || 0);
    const changed = next !== this.frame.time;
    this.frame.time = next;
    this.frame.deltaTime = 0;
    this._seekMediaToTime(next);
    const now = performance.now();
    this.startTime = now - next;
    this.lastTime = now;
    if (this.running || !changed) return;
    if (present === "frame") {
      this._scheduleSeekPresent();
      return;
    }
    if (this.ready && this.renderFn) this.redraw();
  }

  _scheduleSeekPresent() {
    if (this._seekPresentRaf) return;
    this._seekPresentRaf = requestAnimationFrame(() => {
      this._seekPresentRaf = 0;
      if (this.running || !this.ready || !this.renderFn) return;
      this.redraw();
    });
  }

  _cancelSeekPresent() {
    if (!this._seekPresentRaf) return;
    cancelAnimationFrame(this._seekPresentRaf);
    this._seekPresentRaf = 0;
  }

  setAudioBus(bus) {
    this._audioBus = bus || null;
    this._tickAudio({ running: this.running });
  }

  clearAudio() {
    this._audioBus?.clear?.();
    zeroAudioFrame(this.frame.audio);
  }

  writeExportAudio(analysis, { time = 0, playing = true } = {}) {
    if (!this.supportsAudio || !analysis) {
      zeroAudioFrame(this.frame.audio);
      return this.frame.audio;
    }
    const target = this.frame.audio;
    target.volume = analysis.volume;
    target.bands = analysis.bands;
    if (analysis.frequency) target.frequency.set(analysis.frequency);
    target.time = Math.max(0, Number(time) || 0);
    target.playing = Boolean(playing);
    return target;
  }

  _tickAudio({ running = false } = {}) {
    if (!this.supportsAudio || !this._audioBus) {
      zeroAudioFrame(this.frame.audio);
      return;
    }
    this._audioBus.tick(this.frame.audio, { running });
  }

  renderFrame(time, deltaTime, frameNumber) {
    if (!this.ready || !this.renderFn) return null;
    this.frame.time = time;
    this.frame.deltaTime = deltaTime;
    this.frame.frame = frameNumber;
    return this._present();
  }

  /**
   * Wait until submitted GPU work is visible on the canvas. Video export uses
   * this before capturing a VideoFrame from the WebGPU OffscreenCanvas.
   */
  async waitForPresentedFrame() {
    if (!this.ready || !this.device) return;
    await this.device.queue.onSubmittedWorkDone();
  }

  /**
   * Halt playback and reset the shader clock to t=0. Pass `{ resetTime: false }`
   * only for internal halts that must keep the current frame; user pause should
   * call `pause()` instead.
   */
  stop({ resetTime = true } = {}) {
    this._cancelSeekPresent();
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this._cancelMouseReset();
    this._cancelVideoFrameCallback();
    this.video?.pause?.();
    this._syncCompositionSourcePlayback();
    this._tickAudio({ running: false });
    this._audioBus?.suspend?.();
    if (!resetTime) return;
    this.frame.time = 0;
    this.frame.deltaTime = 0;
    this.frame.frame = 0;
    zeroAudioFrame(this.frame.audio);
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    const sizeChanged =
      this.supportsRenderScale && this._applyAdaptiveOutputSize();
    if (sizeChanged && this.ready && this.renderFn) {
      this.resetShaderState();
      return;
    }
    if (this.ready && this.renderFn) this.redraw();
  }

  setActive(active) {
    const next = Boolean(active);
    if (next === this.active) return;
    this.active = next;
    this._syncCompositionSourcePlayback();
    if (!this.active) {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      // Stop the video decoder so a hidden tab quiets the CPU/GPU. Frame
      // callbacks are re-armed on resume.
      this._cancelVideoFrameCallback();
      this.video?.pause?.();
      return;
    }
    if (this.video && this.running) {
      this._videoFrameDirty = true;
      this._watchVideoFrames();
      // play() can reject if interrupted; playback resumes on the next start.
      Promise.resolve(this.video.play?.()).catch(() => {});
    }
    if (this.running) {
      this.lastTime = performance.now();
      this._scheduleLoop();
      if (!this._needsAnimationFrame()) this.redraw();
    }
  }

  _needsAnimationFrame() {
    // Play is an explicit request to advance the shader every frame. Do not
    // gate it on source inspection: valid modules can alias or destructure
    // frame time in ways inferFeatures() cannot reliably detect.
    return this.active && this.running;
  }

  _isLoopActive() {
    return this._needsAnimationFrame() && Boolean(this.rafId);
  }

  _scheduleLoop() {
    if (!this._needsAnimationFrame() || this.rafId) return;
    this.rafId = requestAnimationFrame(this._loopBound);
  }

  _loop(now) {
    this.rafId = 0;
    if (!this._needsAnimationFrame()) return;
    this.frame.time = now - this.startTime;
    this.frame.deltaTime = now - this.lastTime;
    this.lastTime = now;
    this.frame.frame += 1;
    this._tickAudio({ running: true });

    try {
      this._present();
    } catch (err) {
      this.onError(err && err.message ? err.message : String(err));
      this.pause();
      return;
    }
    this._scheduleLoop();
  }

  destroy() {
    this._cancelSeekPresent();
    this.pause();
    clearTimeout(this._fillResizeTimer);
    this._fillResizeTimer = 0;
    clearTimeout(this._zoomResizeTimer);
    this._zoomResizeTimer = 0;
    this._teardownState();
    this.clearInput();
    this._cancelMouseReset();
    this.setPointerSurface(null);
    this.canvas.removeEventListener?.("pointermove", this._onMouse);
    this.canvas.removeEventListener?.("pointerleave", this._onMouseLeave);
    if (this.device) {
      try {
        this.device.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}
