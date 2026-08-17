import { useEffect, useRef } from "react";
import { versionOptionParts } from "../lib/shaderVersions.js";
import "./ShaderVersionSelect.css";

function versionSelectValue({
  dirty,
  hasUncheckpointedChanges,
  versions,
}) {
  if (dirty) return "__unsaved";
  if (hasUncheckpointedChanges) return "__autosaved";
  return versions[0]?.id || "";
}

function tooltipText({ dirty, hasUncheckpointedChanges }) {
  if (dirty) return "Unsaved changes are not yet in version history.";
  if (hasUncheckpointedChanges) {
    return "Autosaved to the cloud, but not yet saved as a restorable version.";
  }
  return "Shader version history";
}

export default function ShaderVersionSelect({
  versions = [],
  versionsLoading = false,
  dirty = false,
  hasUncheckpointedChanges = false,
  disabled = false,
  onChange,
}) {
  const selectRef = useRef(null);
  const value = versionSelectValue({
    dirty,
    hasUncheckpointedChanges,
    versions,
  });

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return;
    const handleChange = (event) => {
      const detail = event.detail;
      const nextValue =
        detail && typeof detail === "object" && "value" in detail
          ? detail.value
          : (detail ?? event.target?.value);
      onChange?.(String(nextValue || ""));
    };
    select.addEventListener("change", handleChange);
    return () => select.removeEventListener("change", handleChange);
  }, [onChange]);

  return (
    <fig-tooltip text={tooltipText({ dirty, hasUncheckpointedChanges })}>
      <fig-select
        ref={selectRef}
        class="shader-version-select"
        label="Version history"
        position="bottom right"
        value={value}
        disabled={disabled ? "" : undefined}
        aria-label="Shader version history"
      >
        <fig-select-options>
          {versionsLoading && versions.length === 0 && (
            <fig-select-option value="" disabled="" label="Loading…">
              <fig-spinner></fig-spinner>
            </fig-select-option>
          )}
          {dirty && (
            <fig-select-option value="__unsaved">
              Unsaved
            </fig-select-option>
          )}
          {!dirty && hasUncheckpointedChanges && (
            <fig-select-option value="__autosaved" label="Autosave">
              <div className="shader-version-select-option">
                <h3>Autosave</h3>
                <label>Not in version history</label>
              </div>
            </fig-select-option>
          )}
          {versions.map((version, index) => {
            const { title, date, subtitle } = versionOptionParts(version, {
              current:
                index === 0 && !dirty && !hasUncheckpointedChanges,
            });
            return (
              <fig-select-option
                key={version.id}
                value={version.id}
                label={title}
              >
                <div className="shader-version-select-option">
                  <h3>
                    {title}
                  </h3>
                  {subtitle ? (
                    <label>
                      {subtitle}
                    </label>
                  ) : null}
                </div>
              </fig-select-option>
            );
          })}
        </fig-select-options>
      </fig-select>
    </fig-tooltip>
  );
}
