import { useEffect, useRef } from "react";
import MarkdownProse from "./MarkdownProse.jsx";
import PlanIcon from "./PlanIcon.jsx";
import "./PlanMarkdownBlock.css";

export default function PlanMarkdownBlock({
  source,
  pending,
  applied,
  defaultExpanded = true,
}) {
  const groupRef = useRef(null);
  const wasPendingRef = useRef(Boolean(pending));
  const initializedRef = useRef(false);

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
      group.setAttribute("open", "true");
    }
    wasPendingRef.current = Boolean(pending);
  }, [pending]);

  if (!source && !pending) return null;

  return (
    <fig-group
      ref={groupRef}
      class="plan-markdown-block"
      collapsible=""
      open={pending ? "true" : undefined}
      data-pending={pending ? "true" : undefined}
    >
      <fig-header class="plan-markdown-header" borderless compact="">
        <h3 className="plan-markdown-title">
          {pending ? (
            <fig-shimmer>
              <span>Writing plan…</span>
            </fig-shimmer>
          ) : (
            <span>{applied ? "Applied plan.md" : "plan.md"}</span>
          )}
        </h3>
        {pending ? (
          <fig-spinner
            class="plan-markdown-status"
            size="small"
            aria-label="Writing plan"
          />
        ) : applied ? (
          <fig-icon
            class="plan-markdown-status"
            name="checkmark"
            size="small"
            aria-label="Plan applied"
          />
        ) : (
          <PlanIcon />
        )}
      </fig-header>
      <MarkdownProse className="plan-markdown-content">{source}</MarkdownProse>
    </fig-group>
  );
}
