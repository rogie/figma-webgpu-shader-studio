const MAX_SUMMARY_LENGTH = 240;

export function sanitizeVersionSummary(value, fallback = "Saved version") {
  const summary = String(value || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (summary || fallback).slice(0, MAX_SUMMARY_LENGTH);
}

function lineCount(source) {
  const text = String(source || "");
  return text ? text.split(/\r?\n/).length : 0;
}

function changedPropertyKeys(previous = {}, next = {}) {
  return [...new Set([...Object.keys(previous || {}), ...Object.keys(next || {})])]
    .filter(
      (key) =>
        JSON.stringify(previous?.[key]) !== JSON.stringify(next?.[key])
    )
    .sort();
}

export function summarizeManualVersion(previous, next) {
  const beforeLines = lineCount(previous?.source);
  const afterLines = lineCount(next?.source);
  const propertyKeys = changedPropertyKeys(
    previous?.parameter_values,
    next?.parameter_values
  );
  const parts = [];
  if (beforeLines !== afterLines) {
    parts.push(`Updated shader source (${beforeLines} → ${afterLines} lines)`);
  } else if (previous?.source !== next?.source) {
    parts.push(`Updated shader logic (${afterLines} lines)`);
  }
  if (previous?.kind !== next?.kind) {
    parts.push(`changed kind to ${next?.kind || "shader"}`);
  }
  if (propertyKeys.length) {
    const shown = propertyKeys.slice(0, 4).join(", ");
    const remaining =
      propertyKeys.length > 4 ? ` +${propertyKeys.length - 4} more` : "";
    parts.push(`changed properties: ${shown}${remaining}`);
  }
  return sanitizeVersionSummary(parts.join("; "), "Saved shader state");
}

export function hasUncheckpointedShaderState(shader) {
  const stateRevision = Number(shader?.state_revision || 0);
  const versionedRevision = Number(shader?.versioned_state_revision || 0);
  return stateRevision > 0 && stateRevision !== versionedRevision;
}

export function versionOptionParts(version, { current = false } = {}) {
  const number = Number(version?.version_number || 0);
  const createdAt = version?.created_at ? new Date(version.created_at) : null;
  const date =
    createdAt && !Number.isNaN(createdAt.valueOf())
      ? createdAt.toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "";
  const kindLabel = {
    agent: "AI",
    publish: "Published",
    restore: "Restored",
    before_restore: "Safety copy",
  }[version?.checkpoint_kind];
  return {
    title: current ? `Current (Version ${number})` : `Version ${number}`,
    date,
    subtitle: [kindLabel, version?.summary].filter(Boolean).join(" · "),
  };
}

export function versionOptionLabel(version, { current = false } = {}) {
  const { title, date, subtitle } = versionOptionParts(version, { current });
  return [title, date, subtitle].filter(Boolean).join(" · ");
}

export function isShaderStateConflict(error) {
  return (
    error?.code === "40001" ||
    String(error?.message || "").includes("shader_state_conflict")
  );
}
