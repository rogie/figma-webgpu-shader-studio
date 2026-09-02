import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIO_FREQUENCY_BINS,
  AudioInputBus,
  analyzeFrequencyBytes,
  analyzePcmWindow,
  createSilentAudioFrame,
  writeAnalyzedAudio,
  zeroAudioFrame,
} from "./audioInput.js";

test("silent audio frame is zeroed and reuses frequency storage", () => {
  const frame = createSilentAudioFrame();
  assert.equal(frame.volume, 0);
  assert.deepEqual(frame.bands, { bass: 0, mid: 0, treble: 0 });
  assert.equal(frame.frequency.length, AUDIO_FREQUENCY_BINS);
  assert.equal(frame.playing, false);
  const same = zeroAudioFrame(frame);
  assert.equal(same, frame);
  assert.equal(same.frequency, frame.frequency);
});

test("frequency analysis writes into the host-owned frame", () => {
  const frequencyBytes = new Uint8Array(AUDIO_FREQUENCY_BINS);
  frequencyBytes[0] = 255;
  frequencyBytes[10] = 128;
  const timeBytes = Uint8Array.from({ length: 128 }, (_, i) => (i % 2 ? 255 : 0));
  const analysis = analyzeFrequencyBytes(frequencyBytes, timeBytes);
  const frame = createSilentAudioFrame();
  const frequency = frame.frequency;
  writeAnalyzedAudio(frame, analysis, { time: 1500, playing: true });
  assert.equal(frame.frequency, frequency);
  assert.equal(frame.frequency[0], 1);
  assert.ok(frame.volume > 0);
  assert.ok(frame.bands.bass > 0);
  assert.equal(frame.time, 1500);
  assert.equal(frame.playing, true);
});

test("pcm window analysis is silent for empty samples", () => {
  const analysis = analyzePcmWindow(new Float32Array(0), 44100, 0);
  assert.equal(analysis.volume, 0);
  assert.equal(analysis.frequency.length, AUDIO_FREQUENCY_BINS);
});

test("file sources monitor through the destination and streams do not", async () => {
  const AudioContextCtor = globalThis.AudioContext;
  const connections = [];
  const destination = { id: "speakers" };
  class FakeNode {
    constructor(kind) {
      this.kind = kind;
    }
    connect(dest) {
      connections.push(`${this.kind}->${dest?.id || dest?.kind || "node"}`);
    }
    disconnect(dest) {
      connections.push(
        dest
          ? `${this.kind} disconnect ${dest.id || dest.kind || "node"}`
          : `${this.kind} disconnect`,
      );
    }
  }
  globalThis.AudioContext = class {
    constructor() {
      this.state = "running";
      this.destination = destination;
    }
    createAnalyser() {
      const node = new FakeNode("analyser");
      node.fftSize = 0;
      node.smoothingTimeConstant = 0;
      return node;
    }
    createGain() {
      this._gainCount = (this._gainCount || 0) + 1;
      const node = new FakeNode(this._gainCount === 1 ? "gain" : "monitor");
      node.gain = { value: 1 };
      return node;
    }
    createMediaElementSource() {
      return new FakeNode("element");
    }
    createMediaStreamSource() {
      return new FakeNode("stream");
    }
    resume() {
      return Promise.resolve();
    }
  };
  try {
    const bus = new AudioInputBus();
    await bus.attachElement({ tagName: "AUDIO" });
    assert.ok(connections.includes("element->gain"));
    assert.ok(connections.includes("gain->analyser"));
    assert.ok(connections.includes("gain->monitor"));
    assert.ok(connections.includes("monitor->speakers"));
    assert.equal(bus.monitorNode.gain.value, 1);
    connections.length = 0;
    await bus.attachStream({ getAudioTracks: () => [] });
    assert.ok(connections.includes("stream->gain"));
    assert.equal(bus.monitorNode.gain.value, 0);
    connections.length = 0;
    bus.clear();
    assert.equal(bus.sourceNode, null);
    assert.ok(connections.some((entry) => entry.includes("disconnect")));
    const frame = createSilentAudioFrame();
    frame.volume = 1;
    frame.playing = true;
    bus.tick(frame, { running: true });
    assert.equal(frame.volume, 0);
    assert.equal(frame.playing, false);
  } finally {
    globalThis.AudioContext = AudioContextCtor;
  }
});

test("file playback gain and monitor can change without reattaching", async () => {
  const AudioContextCtor = globalThis.AudioContext;
  const connections = [];
  const destination = { id: "speakers" };
  class FakeNode {
    constructor(kind) {
      this.kind = kind;
      this.gain = { value: 1 };
    }
    connect(dest) {
      connections.push(`${this.kind}->${dest?.id || dest?.kind || "node"}`);
    }
    disconnect(dest) {
      connections.push(
        dest
          ? `${this.kind} disconnect ${dest.id || dest.kind || "node"}`
          : `${this.kind} disconnect`,
      );
    }
  }
  globalThis.AudioContext = class {
    constructor() {
      this.state = "running";
      this.destination = destination;
    }
    createAnalyser() {
      const node = new FakeNode("analyser");
      node.fftSize = 0;
      node.smoothingTimeConstant = 0;
      return node;
    }
    createGain() {
      this._gainCount = (this._gainCount || 0) + 1;
      const node = new FakeNode(this._gainCount === 1 ? "gain" : "monitor");
      node.gain = { value: 1 };
      return node;
    }
    createMediaElementSource() {
      return new FakeNode("element");
    }
    resume() {
      return Promise.resolve();
    }
  };
  try {
    const bus = new AudioInputBus();
    await bus.attachElement({ tagName: "AUDIO" });
    bus.setGain(1.5);
    assert.equal(bus.gainNode.gain.value, 1.5);
    bus.setMonitor(false);
    assert.equal(bus.monitorNode.gain.value, 0);
    bus.setMonitor(true);
    assert.equal(bus.monitorNode.gain.value, 1);
    bus.clear();
    assert.equal(bus.sourceNode, null);
    bus.setMonitor(true);
    assert.equal(bus.monitorNode.gain.value, 1);
  } finally {
    globalThis.AudioContext = AudioContextCtor;
  }
});

test("file sources play a DOM audio element for speakers", async () => {
  const AudioContextCtor = globalThis.AudioContext;
  const appended = [];
  const fakeBody = {
    appendChild(node) {
      appended.push(node);
      node.isConnected = true;
      return node;
    },
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    body: fakeBody,
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        style: {},
        loop: false,
        muted: false,
        volume: 1,
        src: "",
        paused: true,
        currentTime: 0,
        setAttribute() {},
        removeAttribute() {},
        play() {
          this.paused = false;
          return Promise.resolve();
        },
        pause() {
          this.paused = true;
        },
        load() {},
        remove() {},
      };
    },
  };
  globalThis.AudioContext = class {
    constructor() {
      this.state = "running";
      this.destination = { id: "speakers" };
    }
    createAnalyser() {
      return { fftSize: 0, smoothingTimeConstant: 0, connect() {}, disconnect() {} };
    }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
    createMediaElementSource() {
      return { connect() {}, disconnect() {} };
    }
    resume() {
      return Promise.resolve();
    }
  };
  try {
    const bus = new AudioInputBus();
    const tap = globalThis.document.createElement("audio");
    tap.tagName = "AUDIO";
    tap.src = "https://cdn.example.com/beat.mp3";
    tap.loop = true;
    await bus.attachElement(tap, { monitor: true, gain: 1 });
    assert.equal(bus.monitorNode.gain.value, 0);
    assert.equal(appended.includes(tap), true);
    assert.ok(bus.monitorElement);
    assert.equal(bus.monitorElement.muted, false);
    assert.equal(bus.monitorElement.src, tap.src);
    await bus.syncPlayback({ running: true });
    assert.equal(bus.monitorElement.paused, false);
    bus.setMonitor(false);
    assert.equal(bus.monitorElement.muted, true);
    assert.equal(bus.monitorElement.paused, true);
  } finally {
    globalThis.AudioContext = AudioContextCtor;
    globalThis.document = previousDocument;
  }
});
