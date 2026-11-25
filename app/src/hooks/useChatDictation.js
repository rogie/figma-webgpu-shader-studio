import { useEffect, useRef, useState } from "react";

function recognitionError(code) {
  switch (code) {
    case "aborted":
    case "no-speech":
      return "";
    case "not-allowed":
      return "Allow microphone access to dictate a message.";
    case "audio-capture":
      return "No microphone is available for dictation.";
    case "network":
    case "service-not-allowed":
      return "The browser’s dictation service is unavailable. Try again or type your message.";
    default:
      return "Dictation failed. Try again or type your message.";
  }
}

function abortSession(session) {
  if (!session) return;
  window.clearTimeout(session.finishTimer);
  try {
    session.recognition.abort();
  } catch {
    // The browser may already have ended the session.
  }
  stopMicrophone(session);
}

function stopMicrophone(session) {
  session.stream?.getTracks().forEach((track) => track.stop());
  session.stream = null;
}

export function useChatDictation({ enabled, scope, onError }) {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  const sessionRef = useRef(null);
  const [phase, setPhase] = useState("idle");
  const [startedAt, setStartedAt] = useState(null);
  const [stream, setStream] = useState(null);
  const [transcript, setTranscript] = useState("");

  function reset() {
    setPhase("idle");
    setStartedAt(null);
    setStream(null);
    setTranscript("");
  }

  useEffect(() => {
    reset();
    return () => {
      const session = sessionRef.current;
      sessionRef.current = null;
      abortSession(session);
    };
  }, [enabled, scope]);

  async function start(onComplete) {
    if (!enabled || !Recognition || sessionRef.current) return;
    onError("");
    let recognition;
    try {
      recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
    } catch {
      onError(recognitionError());
      return;
    }

    const session = { recognition, stream: null, transcript: "", finishTimer: 0 };
    sessionRef.current = session;
    const isCurrent = () => sessionRef.current === session;
    const finish = (error = "") => {
      if (!isCurrent()) return;
      sessionRef.current = null;
      window.clearTimeout(session.finishTimer);
      stopMicrophone(session);
      reset();
      if (session.transcript) onComplete(session.transcript);
      if (error) {
        abortSession(session);
        onError(error);
      }
    };
    session.finish = finish;
    recognition.onaudiostart = () => {
      if (!isCurrent() || session.finishTimer) return;
      setStartedAt(Date.now());
      setPhase("recording");
    };
    recognition.onresult = ({ results }) => {
      if (!isCurrent()) return;
      session.transcript = Array.from(results, (result) => result[0]?.transcript.trim() || "")
        .filter(Boolean)
        .join(" ");
      setTranscript(session.transcript);
    };
    recognition.onend = () => finish();
    recognition.onerror = ({ error }) => finish(recognitionError(error));
    setPhase("requesting");
    try {
      session.stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
    } catch (error) {
      const code = error.name === "NotAllowedError" ? "not-allowed" : "audio-capture";
      finish(recognitionError(code));
      return;
    }
    if (!isCurrent()) {
      stopMicrophone(session);
      return;
    }
    setStream(session.stream);
    try {
      const track = session.stream?.getAudioTracks()[0];
      if (track) recognition.start(track);
      else recognition.start();
    } catch (error) {
      // Older implementations only support capturing the microphone themselves.
      if (error.name === "TypeError" || error.name === "NotSupportedError") {
        try {
          recognition.start();
          return;
        } catch {
          // Report the error below.
        }
      }
      finish(recognitionError());
    }
  }

  function stop() {
    const session = sessionRef.current;
    if (!session || session.finishTimer) return;
    if (phase === "requesting") {
      sessionRef.current = null;
      abortSession(session);
      reset();
      return;
    }
    setPhase("finishing");
    // Keep the last transcript if the recognition service never sends an end event.
    session.finishTimer = window.setTimeout(() => {
      session.finish();
      abortSession(session);
    }, 4000);
    try {
      session.recognition.stop();
    } catch {
      session.finish(recognitionError());
    }
  }

  return { supported: Boolean(Recognition), phase, startedAt, stream, transcript, start, stop };
}
