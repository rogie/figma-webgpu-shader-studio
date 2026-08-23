import { useCallback, useRef, useState } from "react";

export function useShaderRuntime() {
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewZoomRequest, setPreviewZoomRequest] = useState(null);
  const [inputSource, setInputSource] = useState("image");
  const [effectVisible, setEffectVisible] = useState(true);
  const [uploading, setUploading] = useState(false);

  const hostRef = useRef(null);
  const pointerSurfaceRef = useRef(null);
  const inputSourceRef = useRef(inputSource);
  const inputApplyGenRef = useRef(0);
  const mediaUrlRef = useRef(null);
  const videoRef = useRef(null);
  // Input choice made before the WebGPU host finished init, applied once ready.
  const pendingInputSourceRef = useRef(null);
  inputSourceRef.current = inputSource;

  const requestPreviewZoom = useCallback((zoom) => {
    setPreviewZoomRequest({ zoom, id: Date.now() });
  }, []);

  const onStageSize = useCallback((width, height) => {
    hostRef.current?.setStageCssSize?.(width, height);
  }, []);

  const onPointerSurface = useCallback((element) => {
    pointerSurfaceRef.current = element;
    hostRef.current?.setPointerSurface?.(element);
  }, []);

  const onPreviewZoomChange = useCallback((zoom) => {
    setPreviewZoom(zoom);
    hostRef.current?.setPreviewZoom?.(zoom);
  }, []);

  const isInputApplyCurrent = useCallback(
    (generation) =>
      generation == null || generation === inputApplyGenRef.current,
    [],
  );

  const clearObjectUrl = useCallback(() => {
    if (mediaUrlRef.current) {
      URL.revokeObjectURL(mediaUrlRef.current);
      mediaUrlRef.current = null;
    }
    if (videoRef.current) {
      const video = videoRef.current;
      const stream = video.srcObject;
      if (stream && typeof stream.getTracks === "function") {
        stream.getTracks().forEach((track) => track.stop());
      }
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
      video.remove();
      videoRef.current = null;
    }
  }, []);

  return {
    runtimeReady,
    setRuntimeReady,
    previewZoom,
    previewZoomRequest,
    requestPreviewZoom,
    inputSource,
    setInputSource,
    effectVisible,
    setEffectVisible,
    uploading,
    setUploading,
    hostRef,
    pointerSurfaceRef,
    inputSourceRef,
    inputApplyGenRef,
    pendingInputSourceRef,
    mediaUrlRef,
    videoRef,
    onStageSize,
    onPointerSurface,
    onPreviewZoomChange,
    isInputApplyCurrent,
    clearObjectUrl,
  };
}
