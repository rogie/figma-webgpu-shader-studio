import { COMPOSITION_KIND, enabledVideoFillSoundtrack } from "../lib/composition.js";
import {
  enabledAudioFileInput,
  normalizeAudioGain,
} from "../lib/documentInputs.js";

function mixMono(channels) {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  const mixed = new Float32Array(first.length);
  const count = channels.length;
  for (let i = 0; i < first.length; i += 1) {
    let sum = 0;
    for (let channel = 0; channel < count; channel += 1) {
      sum += Number(channels[channel]?.[i]) || 0;
    }
    mixed[i] = sum / count;
  }
  return mixed;
}

export function resolveExportSoundtrack({
  kind,
  composition,
  effectFills,
  documentInputs,
} = {}) {
  const inputs =
    kind === COMPOSITION_KIND ? composition?.inputs : documentInputs;
  const audioFile = enabledAudioFileInput(inputs);
  const audioUrl = audioFile?.audio?.url;
  if (audioUrl) {
    return { url: audioUrl, source: "audio" };
  }
  const graph =
    kind === COMPOSITION_KIND ? composition : { fills: effectFills || [] };
  const videoFill = enabledVideoFillSoundtrack(graph);
  const videoUrl = videoFill?.paint?.video?.url;
  if (videoUrl) {
    return { url: videoUrl, source: "video" };
  }
  return null;
}

export function applyAudioPlayback(
  decoded,
  { gain, loop = true, durationSec } = {},
) {
  if (!decoded?.channels?.length) return null;
  const sourceLength = decoded.channels[0]?.length || 0;
  if (!sourceLength) return decoded;
  const gainValue = normalizeAudioGain(gain);
  const rate = Math.max(1, Number(decoded.sampleRate) || 1);
  const durationLength = Number.isFinite(Number(durationSec))
    ? Math.max(1, Math.floor(rate * Number(durationSec)))
    : sourceLength;
  const length = loop ? durationLength : Math.min(sourceLength, durationLength);
  const scaleChannel = (src) => {
    const out = new Float32Array(length);
    const samples = src || [];
    for (let i = 0; i < length; i += 1) {
      const index = loop ? i % sourceLength : i;
      const sample = (Number(samples[index]) || 0) * gainValue;
      out[i] = sample > 1 ? 1 : sample < -1 ? -1 : sample;
    }
    return out;
  };
  const channels = decoded.channels.map(scaleChannel);
  return {
    ...decoded,
    channels,
    mono: mixMono(channels),
    length,
  };
}

export async function decodeExportPcm(url) {
  if (!url) return null;
  const AudioContextCtor =
    globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Web Audio is not available in this browser.");
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not load the soundtrack for video export.");
  }
  const buffer = await response.arrayBuffer();
  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const channels = [];
    for (let i = 0; i < decoded.numberOfChannels; i += 1) {
      channels.push(decoded.getChannelData(i).slice());
    }
    return {
      channels,
      mono: mixMono(channels),
      sampleRate: decoded.sampleRate,
      length: decoded.length,
    };
  } finally {
    await context.close?.();
  }
}
