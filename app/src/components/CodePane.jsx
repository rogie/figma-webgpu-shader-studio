import { lintGutter, linter } from "@codemirror/lint";
import CodeMirror from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { xcodeDark, xcodeLight } from "@uiw/codemirror-theme-xcode";
import interact from "@replit/codemirror-interact";
import { useEffect, useMemo, useState } from "react";
import { figmaShaderLanguage } from "../lib/codeLanguage.js";
import { codeSearch } from "./CodeSearchPanel.js";

const baseExtensions = [
  figmaShaderLanguage,
  EditorView.lineWrapping,
  lintGutter(),
  codeSearch,
];

const numericDragExtension = interact({
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
});

function errorLocation(error) {
  const message = String(error || "");
  const match = message.match(/\((\d+):(\d+)\)(?![\s\S]*\(\d+:\d+\))/);
  if (!match) return null;
  return {
    line: Number(match[1]),
    column: Number(match[2]),
  };
}

export default function CodePane({
  source,
  onSourceChange,
  theme,
  error,
  readOnly = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const location = useMemo(() => errorLocation(error), [error]);
  const extensions = useMemo(() => {
    const diagnostics = linter(
      (view) => {
        if (!error || !location) return [];
        const lineNumber = Math.min(
          Math.max(1, location.line),
          view.state.doc.lines
        );
        const line = view.state.doc.line(lineNumber);
        const from = Math.min(line.to, line.from + Math.max(0, location.column));
        return [
          {
            from,
            to: Math.min(line.to, from + 1),
            severity: "error",
            message: String(error),
          },
        ];
      },
      { delay: 0 }
    );
    return [
      ...baseExtensions,
      readOnly
        ? [
            EditorView.editable.of(false),
            EditorState.readOnly.of(true),
            // A non-editable view can't be focused, which also blocks the
            // search keymap, so keep it reachable by keyboard.
            EditorView.contentAttributes.of({ tabindex: "0" }),
          ]
        : numericDragExtension,
      diagnostics,
    ];
  }, [error, location, readOnly]);

  useEffect(() => {
    if (error) setExpanded(Boolean(location));
  }, [error, location]);

  return (
    <div className="code-pane">
      <div className="code-pane-editor">
        <CodeMirror
          value={source}
          width="100%"
          height="100%"
          theme={theme === "dark" ? xcodeDark : xcodeLight}
          placeholder="Figma shader module"
          extensions={extensions}
          onChange={readOnly ? undefined : onSourceChange}
          editable={!readOnly}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
          }}
        />
      </div>
      {error && (
        <div className="code-error-panel" role="alert">
          <div className="code-error-header">
            <strong>
              {location
                ? `Syntax error · Line ${location.line}, column ${location.column + 1}`
                : "Shader error"}
            </strong>
            {!expanded && <span className="code-error-summary">{error}</span>}
            <fig-button
              class="code-error-copy"
              type="button"
              variant="destructiveSecondary"
              size="small"
              onClick={() => navigator.clipboard.writeText(String(error))}
            >
              Copy
            </fig-button>
            <fig-button
              class="code-error-toggle"
              type="button"
              variant="destructiveGhost"
              icon="true"
              size="small"
              aria-label={expanded ? "Collapse error" : "Expand error"}
              onClick={() => setExpanded((current) => !current)}
            >
              <fig-icon
                name="chevron"
                class={
                  expanded
                    ? "code-error-chevron"
                    : "code-error-chevron is-collapsed"
                }
              />
            </fig-button>
          </div>
          {expanded && <pre className="code-error-message">{error}</pre>}
        </div>
      )}
    </div>
  );
}
