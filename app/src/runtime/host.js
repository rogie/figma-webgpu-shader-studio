// WebGPU host: owns the GPUDevice + canvas context and drives the Figma shader
// module contract (`setup(device, frame)` once, `render(device, frame)` per
// animation frame). See skills/v3.md.tmpl for the frame field semantics.

import { adaptiveRenderScale, cssSizeToDevicePixels } from "./dpi.js";
import { measurePerf, perfNow, recordPerf } from "./perf.js";

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
    this.isAnimated = false;
    this.usesMouse = false;
    this.supportsRenderScale = false;
    this.effectVisible = true;
    this.active = true;
    this.previewZoom = 1;
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
    };

    this.ready = false;
    this.running = false;
    this.rafId = 0;
    this.startTime = 0;
    this.lastTime = 0;
    this._playbackGeneration = 0;
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
    if (this.usesMouse && !this._isLoopActive()) this.redraw();
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
    const renderScale = this.supportsRenderScale
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
      this.logicalOutputSize.width === size.width &&
      this.logicalOutputSize.height === size.height
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

  _teardownState() {
    const s = this.frame.state;
    const borrowedResources = new Set(
      [
        this.device,
        this.context,
        this.inputTexture,
        this.frame.input,
        this.frame.output,
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
    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
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
    const w = Math.min(MAX_DIM, video.videoWidth || 1024);
    const h = Math.min(MAX_DIM, video.videoHeight || 1024);
    const sizeChanged = this._ensureInputTexture(w, h);
    this._videoFrameDirty = true;
    this._watchVideoFrames();
    this._uploadVideoFrame();
    this._rebindAfterInputChange(sizeChanged, { resetState: true });
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
        if (this.video !== video) return;
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
      if (this.video !== video) return;
      this._videoFrameDirty = true;
      // A changing input must continue to render even when shader playback is
      // paused. The RAF loop already presents while running; otherwise render
      // exactly once for each decoded video frame.
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
      this._htmlFrameDirty = false;
      recordPerf("input.htmlUpload");
      return true;
    } catch {
      /* try legacy signatures below */
    }
    try {
      queue.copyElementImageToTexture(this.htmlElement, {
        texture,
        premultipliedAlpha: true,
      });
      this._htmlFrameDirty = false;
      recordPerf("input.htmlUpload");
      return true;
    } catch {
      /* try older 4-arg form */
    }
    try {
      queue.copyElementImageToTexture(this.htmlElement, width, height, {
        texture,
        premultipliedAlpha: true,
      });
      this._htmlFrameDirty = false;
      recordPerf("input.htmlUpload");
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

  async captureInputBitmap({ width, height } = {}) {
    if (!this.ready || !this.inputTexture) return null;
    if (this.video) {
      this._videoFrameDirty = true;
      this._uploadVideoFrame();
    }
    if (this.htmlElement) {
      this._htmlFrameDirty = true;
      this._uploadHtmlFrame();
    }

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
    let readbackBuffer = null;
    let staging = null;
    this._beginCapture();
    try {
      if (wasRunning) this.stop();

      const texture = this._present();
      if (!texture) return null;

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

      // Copy swapchain → owned staging texture first so a later canvas resize
      // cannot cancel the readback after we yield to the event loop.
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

      const source = document.createElement("canvas");
      source.width = srcW;
      source.height = srcH;
      source.getContext("2d").putImageData(new ImageData(packed, srcW, srcH), 0, 0);

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
    if (!this.effectVisible) {
      const output = this._presentPassthrough();
      measurePerf("host.present", startedAt);
      return output;
    }
    this.renderFn(this.device, this.frame);
    measurePerf("host.present", startedAt);
    return this.frame.output;
  }

  // Load a compiled module ({ setup, render }) and re-run setup with validation.
  async setModule(
    { setup, render },
    { isFill, isAnimated, usesMouse, supportsRenderScale } = {}
  ) {
    this._playbackGeneration += 1;
    this.setupFn = setup;
    this.renderFn = render;
    this.isFill = Boolean(isFill);
    this.isAnimated = Boolean(isAnimated);
    this.usesMouse = Boolean(usesMouse);
    this.supportsRenderScale = Boolean(supportsRenderScale);
    this._teardownState();
    this.frame.frame = 0;
    this.startTime = performance.now();
    this.lastTime = this.startTime;

    // Fills have no input — size the target to the preview stage at device DPI.
    if (this.isFill && !this.frame.input) {
      this.setFillSize(this.stageCssSize.width, this.stageCssSize.height);
    } else {
      this._applyAdaptiveOutputSize();
    }

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

  resetShaderState({ present = true } = {}) {
    if (!this.ready || !this.renderFn) return false;
    this._teardownState();
    this.frame.time = 0;
    this.frame.deltaTime = 0;
    this.frame.frame = 0;
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    this.frame.output = this.context.getCurrentTexture();
    if (this.setupFn) this.setupFn(this.device, this.frame);
    if (present) this._present();
    return true;
  }

  start() {
    if (!this.renderFn) return;
    this.running = true;
    const now = performance.now();
    // Resume from the current frame clock so temporary stop()/start() pairs
    // (thumbnail capture) do not jump, and a zeroed pause restarts at t=0.
    this.startTime = now - (Number(this.frame.time) || 0);
    this.lastTime = now;
    if (this._needsAnimationFrame()) {
      this._scheduleLoop();
    } else {
      this.redraw();
    }
  }

  renderFrame(time, deltaTime, frameNumber) {
    if (!this.ready || !this.renderFn) return null;
    this.frame.time = time;
    this.frame.deltaTime = deltaTime;
    this.frame.frame = frameNumber;
    return this._present();
  }

  /**
   * @param {{ resetTime?: boolean }} [options]
   *   resetTime — user pause: snap the preview back to t=0. Leave false for
   *   internal stops (thumbnail capture, compile) that must keep the frame.
   */
  stop({ resetTime = false } = {}) {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    if (!resetTime) return;
    this.frame.time = 0;
    this.frame.deltaTime = 0;
    this.frame.frame = 0;
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    if (this.ready && this.renderFn) this.redraw();
  }

  setActive(active) {
    const next = Boolean(active);
    if (next === this.active) return;
    this.active = next;
    if (!this.active) {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      // Stop the video decoder so a hidden tab quiets the CPU/GPU. Frame
      // callbacks are re-armed on resume.
      this._cancelVideoFrameCallback();
      this.video?.pause?.();
      return;
    }
    if (this.video) {
      this._videoFrameDirty = true;
      this._watchVideoFrames();
      // play() can reject if interrupted; playback simply resumes on next frame.
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

    try {
      this._present();
    } catch (err) {
      this.onError(err && err.message ? err.message : String(err));
      this.stop();
      return;
    }
    this._scheduleLoop();
  }

  destroy() {
    this.stop();
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
