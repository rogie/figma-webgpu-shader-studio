import { useCallback, useEffect, useState } from "react";
import {
  APP_NAV_WIDTH_STORAGE_KEY,
  CHAT_HEIGHT_STORAGE_KEY,
  CODE_WIDTH_STORAGE_KEY,
  MAX_APP_NAV_WIDTH,
  MIN_APP_NAV_WIDTH,
  PREVIEW_HEIGHT_STORAGE_KEY,
  PROPERTIES_WIDTH_STORAGE_KEY,
  readAppNavWidth,
  readChatHeight,
  readCodeWidth,
  readPreviewHeight,
  readPropertiesWidth,
  snapAppNavWidth,
  STACKED_BREAKPOINT,
  writeLayoutPreference,
} from "../lib/layoutStorage.js";

export function usePanelLayout(editorViewRef, editorMounted) {
  const [savedAppNavWidth, setAppNavWidth] = useState(readAppNavWidth);
  const [codeWidth, setCodeWidth] = useState(readCodeWidth);
  const [chatHeight, setChatHeight] = useState(readChatHeight);
  const [previewHeight, setPreviewHeight] = useState(readPreviewHeight);
  const [propertiesWidth, setPropertiesWidth] = useState(readPropertiesWidth);
  const [editorWidth, setEditorWidth] = useState(() => globalThis.innerWidth);
  const stacked = editorWidth <= STACKED_BREAKPOINT;
  const appNavMaxWidth = Math.max(
    MIN_APP_NAV_WIDTH,
    Math.min(MAX_APP_NAV_WIDTH, editorWidth - 420),
  );
  const appNavWidth = Math.min(savedAppNavWidth, appNavMaxWidth);

  useEffect(() => {
    const root = editorViewRef?.current;
    if (!root) return;

    const sync = () => {
      setEditorWidth(root.clientWidth);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(root);
    return () => observer.disconnect();
  }, [editorMounted, editorViewRef]);

  const saveAppNavWidth = useCallback((width) => {
    const next = snapAppNavWidth(width);
    setAppNavWidth(next);
    writeLayoutPreference(APP_NAV_WIDTH_STORAGE_KEY, String(next));
    return Math.min(next, appNavMaxWidth);
  }, [appNavMaxWidth]);

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
    appNavMaxWidth,
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
