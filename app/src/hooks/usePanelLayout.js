import { useCallback, useEffect, useState } from "react";
import {
  APP_NAV_WIDTH_STORAGE_KEY,
  CHAT_HEIGHT_STORAGE_KEY,
  CODE_WIDTH_STORAGE_KEY,
  PREVIEW_HEIGHT_STORAGE_KEY,
  PROPERTIES_WIDTH_STORAGE_KEY,
  readAppNavWidth,
  readChatHeight,
  readCodeWidth,
  readPreviewHeight,
  readPropertiesWidth,
  STACKED_BREAKPOINT,
  writeLayoutPreference,
} from "../lib/layoutStorage.js";

export function usePanelLayout(editorViewRef, editorMounted) {
  const [appNavWidth, setAppNavWidth] = useState(readAppNavWidth);
  const [codeWidth, setCodeWidth] = useState(readCodeWidth);
  const [chatHeight, setChatHeight] = useState(readChatHeight);
  const [previewHeight, setPreviewHeight] = useState(readPreviewHeight);
  const [propertiesWidth, setPropertiesWidth] = useState(readPropertiesWidth);
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
  }, [editorMounted, editorViewRef]);

  const saveAppNavWidth = useCallback((width) => {
    const rounded = Math.round(width);
    setAppNavWidth(rounded);
    writeLayoutPreference(APP_NAV_WIDTH_STORAGE_KEY, String(rounded));
  }, []);

  const savePropertiesWidth = useCallback((width) => {
    const rounded = Math.round(width);
    setPropertiesWidth(rounded);
    writeLayoutPreference(PROPERTIES_WIDTH_STORAGE_KEY, String(rounded));
  }, []);

  const saveCodeWidth = useCallback((width) => {
    const rounded = Math.round(width);
    setCodeWidth(rounded);
    writeLayoutPreference(CODE_WIDTH_STORAGE_KEY, String(rounded));
  }, []);

  const saveChatHeight = useCallback((height) => {
    const rounded = Math.round(height);
    setChatHeight(rounded);
    writeLayoutPreference(CHAT_HEIGHT_STORAGE_KEY, String(rounded));
  }, []);

  const savePreviewHeight = useCallback((height) => {
    if (height == null) {
      setPreviewHeight(null);
      writeLayoutPreference(PREVIEW_HEIGHT_STORAGE_KEY, null);
      return;
    }
    const rounded = Math.round(height);
    setPreviewHeight(rounded);
    writeLayoutPreference(PREVIEW_HEIGHT_STORAGE_KEY, String(rounded));
  }, []);

  return {
    appNavWidth,
    codeWidth,
    chatHeight,
    previewHeight,
    propertiesWidth,
    stacked,
    saveAppNavWidth,
    saveCodeWidth,
    saveChatHeight,
    savePreviewHeight,
    savePropertiesWidth,
  };
}
