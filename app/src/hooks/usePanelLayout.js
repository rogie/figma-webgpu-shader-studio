import { useCallback, useEffect, useState } from "react";
import {
  APP_NAV_WIDTH_STORAGE_KEY,
  CHAT_HEIGHT_STORAGE_KEY,
  CODE_WIDTH_STORAGE_KEY,
  PREVIEW_HEIGHT_STORAGE_KEY,
  readAppNavWidth,
  readChatHeight,
  readCodeWidth,
  readPreviewHeight,
  STACKED_BREAKPOINT,
} from "../lib/layoutStorage.js";

export function usePanelLayout(editorViewRef) {
  const [appNavWidth, setAppNavWidth] = useState(readAppNavWidth);
  const [codeWidth, setCodeWidth] = useState(readCodeWidth);
  const [chatHeight, setChatHeight] = useState(readChatHeight);
  const [previewHeight, setPreviewHeight] = useState(readPreviewHeight);
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const root = editorViewRef?.current;
    if (!root) return;

    const sync = () => {
      setStacked(root.clientWidth <= STACKED_BREAKPOINT);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(root);
    return () => observer.disconnect();
  }, [editorViewRef]);

  const saveAppNavWidth = useCallback((width) => {
    const rounded = Math.round(width);
    setAppNavWidth(rounded);
    localStorage.setItem(APP_NAV_WIDTH_STORAGE_KEY, String(rounded));
  }, []);

  const saveCodeWidth = useCallback((width) => {
    const rounded = Math.round(width);
    setCodeWidth(rounded);
    localStorage.setItem(CODE_WIDTH_STORAGE_KEY, String(rounded));
  }, []);

  const saveChatHeight = useCallback((height) => {
    const rounded = Math.round(height);
    setChatHeight(rounded);
    localStorage.setItem(CHAT_HEIGHT_STORAGE_KEY, String(rounded));
  }, []);

  const savePreviewHeight = useCallback((height) => {
    if (height == null) {
      setPreviewHeight(null);
      localStorage.removeItem(PREVIEW_HEIGHT_STORAGE_KEY);
      return;
    }
    const rounded = Math.round(height);
    setPreviewHeight(rounded);
    localStorage.setItem(PREVIEW_HEIGHT_STORAGE_KEY, String(rounded));
  }, []);

  return {
    appNavWidth,
    codeWidth,
    chatHeight,
    previewHeight,
    stacked,
    saveAppNavWidth,
    saveCodeWidth,
    saveChatHeight,
    savePreviewHeight,
  };
}
