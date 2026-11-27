import { useCallback, useEffect, useState } from "react";
import {
  APP_NAV_WIDTH_STORAGE_KEY,
  CHAT_HEIGHT_STORAGE_KEY,
  CODE_PANE_SHARE_STORAGE_KEY,
  COMPACT_EDITOR_BREAKPOINT,
  MAX_APP_NAV_WIDTH,
  MAX_PROPERTIES_WIDTH,
  MIN_APP_NAV_WIDTH,
  MIN_PROPERTIES_WIDTH,
  PREVIEW_HEIGHT_STORAGE_KEY,
  PROPERTIES_WIDTH_STORAGE_KEY,
  readAppNavWidth,
  readChatHeight,
  readCodePaneShare,
  readPreviewHeight,
  readPropertiesWidth,
  snapAppNavWidth,
  TOOLS_STACK_BREAKPOINT,
  writeLayoutPreference,
} from "../lib/layoutStorage.js";

export function usePanelLayout(editorViewRef, editorMounted) {
  const [savedAppNavWidth, setAppNavWidth] = useState(readAppNavWidth);
  const [codePaneShare, setCodePaneShare] = useState(readCodePaneShare);
  const [chatHeight, setChatHeight] = useState(readChatHeight);
  const [previewHeight, setPreviewHeight] = useState(readPreviewHeight);
  const [savedPropertiesWidth, setPropertiesWidth] = useState(readPropertiesWidth);
  const [editorWidth, setEditorWidth] = useState(() => globalThis.innerWidth);
  const toolsSideBySide = editorWidth > TOOLS_STACK_BREAKPOINT;
  const compact = editorWidth <= COMPACT_EDITOR_BREAKPOINT;
  // Leave space for the preview and four 16px gutters around the columns.
  const railWidthBudget = editorWidth - 64 - (toolsSideBySide ? 400 : 250);
  const appNavWidth = Math.min(savedAppNavWidth, Math.max(
    MIN_APP_NAV_WIDTH,
    compact ? editorWidth - 420 : railWidthBudget - MIN_PROPERTIES_WIDTH,
  ));
  const propertiesMaxWidth = Math.max(
    MIN_PROPERTIES_WIDTH,
    Math.min(MAX_PROPERTIES_WIDTH, railWidthBudget - appNavWidth),
  );
  const propertiesWidth = Math.min(savedPropertiesWidth, propertiesMaxWidth);
  const appNavMaxWidth = Math.max(
    MIN_APP_NAV_WIDTH,
    Math.min(MAX_APP_NAV_WIDTH, compact ? editorWidth - 420 : railWidthBudget - propertiesWidth),
  );

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

  const saveCodePaneShare = useCallback((share) => {
    setCodePaneShare(share);
    writeLayoutPreference(CODE_PANE_SHARE_STORAGE_KEY, String(share));
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
    codePaneShare,
    chatHeight,
    previewHeight,
    propertiesWidth,
    propertiesMaxWidth,
    toolsSideBySide,
    saveAppNavWidth,
    saveCodePaneShare,
    saveChatHeight,
    savePreviewHeight,
    savePropertiesWidth,
  };
}
