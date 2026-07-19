import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import { xcodeDark, xcodeLight } from "@uiw/codemirror-theme-xcode";
import interact from "@replit/codemirror-interact";

const extensions = [
  javascript({ typescript: true, jsx: false }),
  EditorView.lineWrapping,
  interact({
    rules: [
      {
        regexp: /-?\b\d+\.?\d*\b/g,
        cursor: "ew-resize",
        onDrag: (text, setText, event) => {
          const value = Number(text) + event.movementX;
          if (!Number.isNaN(value)) setText(value.toString());
        },
      },
    ],
  }),
];

export default function CodePane({ source, onSourceChange }) {
  const [darkMode, setDarkMode] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = (event) => setDarkMode(event.matches);
    media.addEventListener("change", updateTheme);
    return () => media.removeEventListener("change", updateTheme);
  }, []);

  return (
    <CodeMirror
      value={source}
      width="100%"
      height="100%"
      theme={darkMode ? xcodeDark : xcodeLight}
      placeholder="Figma shader module"
      extensions={extensions}
      onChange={onSourceChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
      }}
    />
  );
}
