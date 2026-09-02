export const AUDIO_FREQUENCY_BINS = 64;
export const AUDIO_FFT_SIZE = AUDIO_FREQUENCY_BINS * 2;

function clamp01(value) {
  const next = Number(value) || 0;
  if (next <= 0) return 0;
  if (next >= 1) return 1;
  return next;
}

export function createSilentAudioFrame() {
  return {
    volume: 0,
    bands: { bass: 0, mid: 0, treble: 0 },
    frequency: new Float32Array(AUDIO_FREQUENCY_BINS),
    time: 0,
    playing: false,
  };
}

export function zeroAudioFrame(frame) {
  const target = frame && typeof frame === "object" ? frame : createSilentAudioFrame();
  target.volume = 0;
  target.bands = { bass: 0, mid: 0, treble: 0 };
  if (!(target.frequency instanceof Float32Array) || target.frequency.length !== AUDIO_FREQUENCY_BINS) {
    target.frequency = new Float32Array(AUDIO_FREQUENCY_BINS);
  } else {
    target.frequency.fill(0);
  }
  target.time = 0;
  target.playing = false;
  return target;
}

function meanRange(bytes, start, end) {
  const last = Math.min(bytes.length, end);
  const first = Math.max(0, start);
  if (last <= first) return 0;
  let sum = 0;
  for (let i = first; i < last; i += 1) sum += bytes[i];
  return sum / (last - first) / 255;
}

export function analyzeFrequencyBytes(frequencyBytes, timeDomainBytes) {
  const bins = AUDIO_FREQUENCY_BINS;
  const frequency = new Float32Array(bins);
  const source = frequencyBytes || [];
  for (let i = 0; i < bins; i += 1) {
    frequency[i] = clamp01((Number(source[i]) || 0) / 255);
  }
  let sumSquares = 0;
  const time = timeDomainBytes || [];
  const count = time.length || 1;
  for (let i = 0; i < time.length; i += 1) {
    const centered = ((Number(time[i]) || 128) - 128) / 128;
    sumSquares += centered * centered;
  }
  const volume = time.length ? clamp01(Math.sqrt(sumSquares / count) * 2) : 0;
  return {
    volume,
    bands: {
      bass: clamp01(meanRange(source, 0, 6) * 1.4),
      mid: clamp01(meanRange(source, 6, 24) * 1.4),
      treble: clamp01(meanRange(source, 24, bins) * 1.4),
    },
    frequency,
  };
}

export function writeAnalyzedAudio(frame, analysis, { time = 0, playing = false } = {}) {
  const target = frame && typeof frame === "object" ? frame : createSilentAudioFrame();
  target.volume = analysis.volume;
  target.bands = analysis.bands;
  if (!(target.frequency instanceof Float32Array) || target.frequency.length !== AUDIO_FREQUENCY_BINS) {
    target.frequency = new Float32Array(AUDIO_FREQUENCY_BINS);
  }
  target.frequency.set(analysis.frequency);
  target.time = Math.max(0, Number(time) || 0);
  target.playing = Boolean(playing);
  return target;
}

export function analyzePcmWindow(samples, sampleRate, timeMs) {
  const rate = Math.max(1, Number(sampleRate) || 1);
  const data = samples && samples.length ? samples : new Float32Array(0);
  const windowSize = AUDIO_FFT_SIZE;
  const start = Math.max(0, Math.floor(((Number(timeMs) || 0) / 1000) * rate));
  const timeDomain = new Uint8Array(windowSize);
  let sumSquares = 0;
  for (let i = 0; i < windowSize; i += 1) {
    const sample = Number(data[start + i]) || 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    sumSquares += clamped * clamped;
    timeDomain[i] = Math.round((clamped * 0.5 + 0.5) * 255);
  }
  const frequencyBytes = new Uint8Array(AUDIO_FREQUENCY_BINS);
  for (let k = 0; k < AUDIO_FREQUENCY_BINS; k += 1) {
    let real = 0;
    let imag = 0;
    const omega = (Math.PI * 2 * k) / windowSize;
    for (let n = 0; n < windowSize; n += 1) {
      const sample = Number(data[start + n]) || 0;
      real += sample * Math.cos(omega * n);
      imag -= sample * Math.sin(omega * n);
    }
    const magnitude = Math.sqrt(real * real + imag * imag) / (windowSize / 2);
    frequencyBytes[k] = Math.round(clamp01(magnitude) * 255);
  }
  const analysis = analyzeFrequencyBytes(frequencyBytes, timeDomain);
  if (!data.length) {
    analysis.volume = 0;
  } else {
    analysis.volume = clamp01(Math.sqrt(sumSquares / windowSize) * 2);
  }
  return analysis;
}

function disconnectNode(node) {
  try {
    node?.disconnect?.();
  } catch {
    // Already disconnected.
  }
}

function hideMediaElement(el) {
  if (!el || typeof el.setAttribute !== "function") return;
  el.setAttribute("playsinline", "");
  el.setAttribute("aria-hidden", "true");
  if (el.style) {
    el.style.cssText =
      "position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;border:0;";
  }
}

function canUseHtmlMonitor() {
  return typeof document !== "undefined" && Boolean(document.body?.appendChild);
}

export class AudioInputBus {
  constructor() {
    this.context = null;
    this.analyser = null;
    this.gainNode = null;
    this.monitorNode = null;
    this.monitorElement = null;
    this.sourceNode = null;
    this.element = null;
    this.stream = null;
    this._ownsStream = false;
    this._monitor = false;
    this._gain = 1;
    this.freqBytes = new Uint8Array(AUDIO_FREQUENCY_BINS);
    this.timeBytes = new Uint8Array(AUDIO_FFT_SIZE);
    this.error = "";
  }

  async _ensureGraph() {
    const AudioContextCtor =
      globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("Web Audio is not available in this browser.");
    }
    if (!this.context) {
      this.context = new AudioContextCtor();
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    if (!this.analyser) {
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = AUDIO_FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0.7;
    }
    if (!this.gainNode) {
      this.gainNode = this.context.createGain();
      this.gainNode.gain.value = this._gain;
      this.gainNode.connect(this.analyser);
    }
    if (!this.monitorNode) {
      this.monitorNode = this.context.createGain();
      this.monitorNode.gain.value = this._monitor ? 1 : 0;
      this.gainNode.connect(this.monitorNode);
      this.monitorNode.connect(this.context.destination);
    }
    return this.context;
  }

  _webAudioMonitorGain() {
    return this.monitorElement ? 0 : this._monitor ? 1 : 0;
  }

  _releaseHtmlMonitor() {
    const el = this.monitorElement;
    if (!el) return;
    try {
      el.pause?.();
    } catch {
      // Ignore.
    }
    el.removeAttribute?.("src");
    el.load?.();
    el.remove?.();
    this.monitorElement = null;
  }

  _bindHtmlMonitor(sourceElement) {
    this._releaseHtmlMonitor();
    if (!canUseHtmlMonitor() || sourceElement?.tagName !== "AUDIO") return false;
    const monitor = document.createElement("audio");
    hideMediaElement(monitor);
    monitor.preload = "auto";
    monitor.loop = Boolean(sourceElement.loop);
    if (sourceElement.crossOrigin) monitor.crossOrigin = sourceElement.crossOrigin;
    monitor.src = sourceElement.src || sourceElement.currentSrc || "";
    monitor.muted = !this._monitor;
    monitor.volume = Math.max(0, Math.min(1, this._gain));
    document.body.appendChild(monitor);
    this.monitorElement = monitor;
    return true;
  }

  _syncHtmlMonitor() {
    const monitor = this.monitorElement;
    const tap = this.element;
    if (!monitor) return;
    monitor.loop = Boolean(tap?.loop);
    monitor.muted = !this._monitor;
    monitor.volume = Math.max(0, Math.min(1, this._gain));
    if (this._monitor && tap && !tap.paused) {
      try {
        if (Number.isFinite(tap.currentTime)) monitor.currentTime = tap.currentTime;
      } catch {
        // Some browsers reject currentTime before metadata.
      }
      monitor.play?.().catch(() => {});
    } else {
      monitor.pause?.();
    }
  }

  setGain(value) {
    const next = Number(value);
    this._gain = Number.isFinite(next) ? Math.max(0, Math.min(2, next)) : 1;
    if (this.gainNode) this.gainNode.gain.value = this._gain;
    if (this.monitorElement) {
      this.monitorElement.volume = Math.max(0, Math.min(1, this._gain));
    }
    if (this.monitorNode) this.monitorNode.gain.value = this._webAudioMonitorGain();
  }

  setMonitor(enabled) {
    this._monitor = Boolean(enabled);
    if (this.monitorNode) this.monitorNode.gain.value = this._webAudioMonitorGain();
    this._syncHtmlMonitor();
  }

  async syncPlayback({ running = false } = {}) {
    const tap = this.element;
    if (running) {
      await tap?.play?.().catch(() => {});
      this._syncHtmlMonitor();
      return;
    }
    tap?.pause?.();
    this.monitorElement?.pause?.();
  }

  _clearSource() {
    this._releaseHtmlMonitor();
    disconnectNode(this.sourceNode);
    this.sourceNode = null;
    this.element = null;
    if (this._ownsStream) {
      this.stream?.getAudioTracks?.().forEach((track) => track.stop());
    }
    this.stream = null;
    this._ownsStream = false;
  }

  async attachElement(element, { monitor = true, gain } = {}) {
    this.error = "";
    await this._ensureGraph();
    this._clearSource();
    if (gain != null) this.setGain(gain);
    if (!element) return;
    try {
      this.sourceNode = this.context.createMediaElementSource(element);
      this.sourceNode.connect(this.gainNode);
      this.element = element;
      if (element.tagName === "AUDIO") {
        hideMediaElement(element);
        if (canUseHtmlMonitor() && !element.isConnected) {
          document.body.appendChild(element);
        }
        this._bindHtmlMonitor(element);
      }
      this.setMonitor(Boolean(monitor));
    } catch (attachError) {
      this.error =
        attachError?.message ||
        "Could not tap this media for audio. Remote URLs may be blocked by CORS.";
      throw new Error(this.error);
    }
  }

  async attachStream(stream, { owned = false } = {}) {
    this.error = "";
    await this._ensureGraph();
    this._clearSource();
    if (!stream) return;
    this.sourceNode = this.context.createMediaStreamSource(stream);
    this.sourceNode.connect(this.gainNode);
    this.setGain(1);
    this.setMonitor(false);
    this.stream = stream;
    this._ownsStream = Boolean(owned);
  }

  async resume() {
    if (!this.context) return;
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  suspend() {
    this.element?.pause?.();
    this.monitorElement?.pause?.();
    if (this.context?.state === "running") {
      this.context.suspend?.().catch(() => {});
    }
  }

  clear() {
    this._clearSource();
    this.error = "";
  }

  tick(frame, { running = false } = {}) {
    if (!this.sourceNode || !this.analyser) {
      zeroAudioFrame(frame);
      return frame;
    }
    if (!running) {
      if (frame) frame.playing = false;
      return frame;
    }
    this.analyser.getByteFrequencyData(this.freqBytes);
    this.analyser.getByteTimeDomainData(this.timeBytes);
    const analysis = analyzeFrequencyBytes(this.freqBytes, this.timeBytes);
    const media = this.element;
    const time = media && Number.isFinite(media.currentTime)
      ? media.currentTime * 1000
      : 0;
    const playing = Boolean(
      media
        ? !media.paused && !media.ended
        : this.stream?.getAudioTracks?.().some((track) => track.readyState === "live"),
    );
    return writeAnalyzedAudio(frame, analysis, { time, playing });
  }

  dispose() {
    this._clearSource();
    disconnectNode(this.monitorNode);
    this.monitorNode = null;
    disconnectNode(this.gainNode);
    this.gainNode = null;
    this.analyser = null;
    if (this.context) {
      this.context.close?.().catch(() => {});
      this.context = null;
    }
  }
}
