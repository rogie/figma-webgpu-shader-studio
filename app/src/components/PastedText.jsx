import { useEffect, useMemo, useRef, useState } from "react";
import { LANGUAGE_LABELS, pastedExtension } from "../lib/pastedText.js";
import {
  hasLanguageSupport,
  highlightRanges,
  loadLanguageSupport,
} from "../lib/pastedHighlight.js";
import CodeBlockIcon from "./CodeBlockIcon.jsx";
import { useOverflowFade } from "../hooks/useOverflowFade.js";
import "./PastedText.css";

export default function PastedText({
  text,
  language = "text",
  label,
  nested = [],
  defaultExpanded = true,
  onRemove,
}) {
  const groupRef = useRef(null);
  const sourceFadeRef = useOverflowFade();
  const initializedRef = useRef(false);
  const [languageSupport, setLanguageSupport] = useState(null);

  const nestedKey = nested.join(",");
  const canHighlight = hasLanguageSupport(language);

  useEffect(() => {
    if (!canHighlight) {
      setLanguageSupport(null);
      return undefined;
    }
    let active = true;
    setLanguageSupport(null);
    loadLanguageSupport(language, { nested })
      .then((support) => {
        if (active) setLanguageSupport(support);
      })
      .catch(() => {
        if (active) setLanguageSupport(null);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, nestedKey, canHighlight]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || initializedRef.current) return;
    initializedRef.current = true;
    group.setAttribute("open", defaultExpanded ? "true" : "false");
  }, [defaultExpanded]);

  const highlighted = useMemo(
    () => highlightRanges(text || "", languageSupport),
    [text, languageSupport]
  );

  if (!text) return null;

  const displayLabel = label || LANGUAGE_LABELS[language] || language || "text";

  return (
    <fig-group
      ref={groupRef}
      class="pasted-text"
      collapsible=""
      open={defaultExpanded ? "true" : undefined}
      data-language={language}
    >
      <fig-header class="pasted-text-header" borderless compact="">
        <h3 className="pasted-text-title">
          <span className="pasted-text-extension">{pastedExtension(language)}</span>
          <span className="pasted-text-filename">Pasted {displayLabel}</span>
        </h3>
        {onRemove ? (
          <fig-button
            type="button"
            variant="ghost"
            size="small"
            icon="true"
            aria-label={`Remove pasted ${displayLabel}`}
            onClick={onRemove}
          >
            <fig-icon name="close" size="small" />
          </fig-button>
        ) : (
          <CodeBlockIcon
            class="pasted-text-status"
            size="small"
            aria-label={`Pasted ${displayLabel}`}
          />
        )}
      </fig-header>
      <pre ref={sourceFadeRef} className="pasted-text-source">
        <code>
          {highlighted.map((range) =>
            range.classes ? (
              <span
                className={range.classes}
                key={`${range.from}:${range.to}`}
              >
                {range.text}
              </span>
            ) : (
              range.text
            )
          )}
        </code>
      </pre>
    </fig-group>
  );
}
