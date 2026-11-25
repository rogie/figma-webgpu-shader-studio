import { useEffect, useRef, useState } from "react";
import StopIcon from "./StopIcon.jsx";

const BAR_SPACING = 6;
const SAMPLE_INTERVAL = 64;

export function DictateIcon() {
  return (
    <fig-icon>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16.5 11.5c.276 0 .5.224.5.5a5.001 5.001 0 0 1-4.5 4.975V18h2a.5.5 0 0 1 0 1h-5a.5.5 0 0 1 0-1h2v-1.025A5.001 5.001 0 0 1 7 12a.5.5 0 0 1 1 0 4 4 0 0 0 8 0c0-.276.224-.5.5-.5ZM12 5a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V8a3 3 0 0 1 3-3Zm0 1a2 2 0 0 0-2 2v4a2 2 0 1 0 4 0V8a2 2 0 0 0-2-2Z"
        />
      </svg>
    </fig-icon>
  );
}

function RecordingTime({ startedAt }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <time dateTime={`PT${seconds}S`} aria-hidden="true">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </time>
  );
}

function RecordingWaveform({ stream }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const pen = canvas.getContext("2d");
    if (!pen) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let audio;
    let analyser;
    let source;
    if (stream && !reducedMotion && window.AudioContext) {
      try {
        audio = new AudioContext();
        analyser = audio.createAnalyser();
        analyser.fftSize = 1024;
        source = audio.createMediaStreamSource(stream);
        source.connect(analyser);
        void audio.resume().catch(() => {});
      } catch {
        analyser = undefined;
      }
    }

    const samples = new Float32Array(analyser?.fftSize ?? 0);
    const history = [];
    let width = 0;
    let height = 0;
    let lastSample = performance.now();
    let frameId = 0;
    const paint = (offset = 0) => {
      pen.clearRect(0, 0, width, height);
      pen.beginPath();
      for (let x = width - 2 - offset, index = 0; x >= 0; x -= BAR_SPACING, index++) {
        const amplitude = 0.25 + (history[index] ?? 0) * Math.max(0, height / 2 - 2);
        pen.moveTo(x, height / 2 - amplitude);
        pen.lineTo(x, height / 2 + amplitude);
      }
      pen.stroke();
    };
    const resize = new ResizeObserver(([entry]) => {
      ({ width, height } = entry.contentRect);
      const ratio = window.devicePixelRatio;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      pen.setTransform(ratio, 0, 0, ratio, 0, 0);
      pen.strokeStyle = getComputedStyle(canvas).color;
      pen.lineWidth = 2;
      pen.lineCap = "round";
      paint();
    });
    resize.observe(canvas);

    const update = (now) => {
      const elapsed = now - lastSample;
      if (elapsed >= SAMPLE_INTERVAL) {
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const rms = Math.sqrt(energy / samples.length);
        history.unshift(Math.min(1, Math.max(0, (rms - 0.01) * 5)));
        history.splice(Math.ceil(width / BAR_SPACING) + 1);
        lastSample = now - (elapsed % SAMPLE_INTERVAL);
      }
      paint(((now - lastSample) / SAMPLE_INTERVAL) * BAR_SPACING);
      frameId = window.requestAnimationFrame(update);
    };
    if (analyser) frameId = window.requestAnimationFrame(update);
    return () => {
      resize.disconnect();
      window.cancelAnimationFrame(frameId);
      source?.disconnect();
      analyser?.disconnect();
      void audio?.close().catch(() => {});
    };
  }, [stream]);

  return <canvas ref={canvasRef} className="chat-dictation-wave" aria-hidden="true" />;
}

export default function ChatDictationControls({ dictation, stopButtonRef }) {
  const recording = dictation.phase === "recording";
  return (
    <div className="chat-dictation-controls">
      <div className="chat-dictation-status" role="status" aria-label={recording ? "Recording dictation" : undefined}>
        {recording ? (
          <>
            <RecordingTime startedAt={dictation.startedAt} />
            <RecordingWaveform stream={dictation.stream} />
          </>
        ) : (
          <span>{dictation.phase === "requesting" ? "Waiting for microphone…" : "Finishing dictation…"}</span>
        )}
      </div>
      <fig-tooltip text="Stop dictation">
        <fig-button
          ref={stopButtonRef}
          type="button"
          variant="ghost"
          icon=""
          pill=""
          aria-label="Stop dictation"
          disabled={dictation.phase === "finishing" ? "" : undefined}
          onClick={dictation.stop}
        >
          <StopIcon />
        </fig-button>
      </fig-tooltip>
    </div>
  );
}
