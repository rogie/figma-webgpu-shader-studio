import { classHighlighter, highlightTree } from "@lezer/highlight";
import { useEffect, useMemo, useRef } from "react";
import { figmaShaderLanguage } from "../lib/codeLanguage.js";
import "./StreamingCodeBlock.css";

function highlightSource(source) {
  const tree = figmaShaderLanguage.language.parser.parse(source);
  const nodes = [];
  let cursor = 0;

  highlightTree(tree, classHighlighter, (from, to, classes) => {
    if (from > cursor) nodes.push(source.slice(cursor, from));
    nodes.push(
      <span className={classes} key={`${from}:${to}`}>
        {source.slice(from, to)}
      </span>
    );
    cursor = to;
  });
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes;
}

export default function StreamingCodeBlock({
  source,
  pending,
  applied,
  incomplete,
  defaultExpanded = Boolean(pending),
}) {
  const groupRef = useRef(null);
  const preRef = useRef(null);
  const wasPendingRef = useRef(Boolean(pending));
  const initializedRef = useRef(false);
  const highlightedSource = useMemo(
    () => highlightSource(source || ""),
    [source]
  );

  useEffect(() => {
    const group = groupRef.current;
    if (!group || initializedRef.current) return;
    initializedRef.current = true;
    group.setAttribute("open", defaultExpanded ? "true" : "false");
  }, [defaultExpanded]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    if (pending) {
      group.setAttribute("open", "true");
    } else if (wasPendingRef.current) {
      group.setAttribute("open", "false");
    }
    wasPendingRef.current = Boolean(pending);
  }, [pending]);

  useEffect(() => {
    if (!pending || groupRef.current?.getAttribute("open") === "false") return;
    const pre = preRef.current;
    if (pre) pre.scrollTop = pre.scrollHeight;
  }, [source, pending]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return undefined;
    const observer = new MutationObserver(() => {
      if (pending && group.getAttribute("open") !== "true") {
        group.setAttribute("open", "true");
        return;
      }
      if (group.getAttribute("open") === "false") return;
      requestAnimationFrame(() => {
        group.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    });
    observer.observe(group, {
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, [pending]);

  if (!source) return null;

  const status = pending
    ? "Writing module…"
    : incomplete
      ? "Incomplete"
      : applied
        ? "Applied"
        : "Generated";
  const filenameLabel = pending
    ? "Writing main.ts"
    : incomplete
      ? "Incomplete main.ts"
      : applied
        ? "Applied main.ts"
        : "Didn't apply main.ts";

  return (
    <fig-group
      ref={groupRef}
      class="streaming-code-block"
      collapsible=""
      open={pending ? "true" : undefined}
      data-pending={pending ? "true" : undefined}
      data-incomplete={incomplete ? "true" : undefined}
    >
      <fig-header class="streaming-code-header" borderless compact="">
        <h3 className="streaming-code-title">
          {pending ? (
            <fig-shimmer>
              <span className="streaming-code-filename">{filenameLabel}</span>
            </fig-shimmer>
          ) : (
            <span className="streaming-code-filename">{filenameLabel}</span>
          )}
        </h3>
        {pending ? (
          <fig-spinner
            class="streaming-code-status"
            size="small"
            aria-label={status}
          />
        ) : incomplete ? (
          <fig-tooltip text="Response ended before code was complete">
            <fig-icon
              class="streaming-code-status"
              name="warning"
              size="small"
              aria-label="Incomplete module"
            />
          </fig-tooltip>
        ) : applied ? (
          <fig-icon
            class="streaming-code-status"
            name="checkmark"
            size="small"
            aria-label="Module applied"
          />
        ) : (
          <fig-tooltip text="Didn't apply">
            <fig-icon
              class="streaming-code-status"
              name="hidden"
              size="small"
              aria-label="Didn't apply module"
            />
          </fig-tooltip>
        )}
      </fig-header>
      <pre ref={preRef} className="streaming-code-source">
        <code>
          {highlightedSource}
          {pending && (
            <span className="streaming-code-cursor" aria-hidden="true" />
          )}
        </code>
      </pre>
    </fig-group>
  );
}
