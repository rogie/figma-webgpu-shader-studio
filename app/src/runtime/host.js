// WebGPU host: owns the GPUDevice + canvas context and drives the Figma shader
// module contract (`setup(device, frame)` once, `render(device, frame)` per
// animation frame). See skills/v3.md.tmpl for the frame field semantics.

const MAX_DIM = 2048;

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

    this.inputTexture = null;
    this.video = null; // HTMLVideoElement when the input is a video

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

  setSize(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
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

  // Replace the input from an ImageBitmap / VideoFrame source (static).
  setImageInput(source, width, height) {
    if (this.inputTexture) {
      this.inputTexture.destroy();
      this.inputTexture = null;
    }
    this.video = null;
    if (!source) {
      this.frame.input = null;
      return;
    }
    let w = width || source.width;
    let h = height || source.height;
    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    this.inputTexture = this.device.createTexture({
      size: [w, h],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture(
      { source, flipY: false },
      { texture: this.inputTexture, premultipliedAlpha: true },
      [w, h]
    );
    this.frame.input = this.inputTexture;
    this.setSize(w, h);
  }

  setVideoInput(video) {
    if (this.inputTexture) {
      this.inputTexture.destroy();
      this.inputTexture = null;
    }
    this.video = video;
    const w = Math.min(MAX_DIM, video.videoWidth || 1024);
    const h = Math.min(MAX_DIM, video.videoHeight || 1024);
    this.inputTexture = this.device.createTexture({
      size: [w, h],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.frame.input = this.inputTexture;
    this.setSize(w, h);
  }

  _uploadVideoFrame() {
    if (!this.video || this.video.readyState < 2) return;
    this.device.queue.copyExternalImageToTexture(
      { source: this.video, flipY: false },
      { texture: this.inputTexture, premultipliedAlpha: true },
      [this.inputTexture.width, this.inputTexture.height]
    );
  }

  clearInput() {
    if (this.inputTexture) {
      this.inputTexture.destroy();
      this.inputTexture = null;
    }
    this.video = null;
    this.frame.input = null;
  }

  setParams(params) {
    this.frame.params = params || {};
  }

  // Load a compiled module ({ setup, render }) and re-run setup with validation.
  async setModule({ setup, render }, { isFill } = {}) {
    this.setupFn = setup;
    this.renderFn = render;
    this._teardownState();
    this.frame.frame = 0;
    this.startTime = performance.now();
    this.lastTime = this.startTime;

    // Fills have no input; keep the canvas at a sensible default when no media.
    if (isFill && !this.frame.input) {
      this.setSize(1024, 1024);
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
