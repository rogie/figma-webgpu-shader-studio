const MAX_SUMMARY_LENGTH = 240;

export function sanitizeVersionSummary(value, fallback = "Saved version") {
  const summary = String(value || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (summary || fallback).slice(0, MAX_SUMMARY_LENGTH);
}

export function summarizeAgentVersion(
  prose,
  fallback = "Applied an AI-generated shader update"
) {
  const cleaned = sanitizeVersionSummary(prose, "");
  const sentence = cleaned.match(/^.*?[.!?](?=\s|$)/)?.[0] || cleaned;
  return sanitizeVersionSummary(sentence, fallback);
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
  if (
    JSON.stringify(previous?.composition || {}) !==
    JSON.stringify(next?.composition || {})
  ) {
    parts.push("changed layer stack");
  }
  if (
    previous?.input_path !== next?.input_path ||
    previous?.input_name !== next?.input_name ||
    previous?.input_mime_type !== next?.input_mime_type
  ) {
    parts.push("changed input media");
  }
  if (
    JSON.stringify(previous?.dependency_snapshots || {}) !==
    JSON.stringify(next?.dependency_snapshots || {})
  ) {
    parts.push("updated pinned dependencies");
  }
  return sanitizeVersionSummary(parts.join("; "), "Saved shader state");
}

export function hasUncheckpointedShaderState(shader) {
  const stateRevision = Number(shader?.state_revision || 0);
  const versionedRevision = Number(shader?.versioned_state_revision || 0);
  return stateRevision > 0 && stateRevision !== versionedRevision;
}

export function resolveAgentCheckpointAfterCompile(
  pending,
  { presetId, source, values }
) {
  if (
    !pending ||
    pending.presetId !== presetId ||
    pending.source !== source
  ) {
    return null;
  }
  return { ...pending, values };
}

const VERSION_KIND_LABELS = {
  agent: "AI",
  publish: "Published",
  restore: "Restored",
  before_restore: "Safety copy",
};

function versionDate(version) {
  const createdAt = version?.created_at ? new Date(version.created_at) : null;
  return createdAt && !Number.isNaN(createdAt.valueOf()) ? createdAt : null;
}

export function versionRowParts(version, { current = false } = {}) {
  const number = Number(version?.version_number || 0);
  const createdAt = versionDate(version);
  const summary = sanitizeVersionSummary(version?.summary, "");
  const kindLabel = VERSION_KIND_LABELS[version?.checkpoint_kind];
  return {
    title: summary || `Version ${number}`,
    time: createdAt
      ? createdAt.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      : "",
    subtitle: [
      `Version ${number}`,
      current ? "Current" : null,
      summary ? kindLabel : null,
    ]
      .filter(Boolean)
      .join(" · "),
    fullDate: createdAt
      ? createdAt.toLocaleString([], {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "",
  };
}

function dayKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dayLabel(date, now) {
  const today = dayKey(now);
  if (dayKey(date) === today) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function groupVersionsByDay(versions = [], now = new Date()) {
  const groups = [];
  const byKey = new Map();
  for (const version of versions) {
    const createdAt = versionDate(version);
    const key = createdAt ? dayKey(createdAt) : "unknown";
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: createdAt ? dayLabel(createdAt, now) : "Earlier",
        versions: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.versions.push(version);
  }
  return groups;
}

export function isShaderStateConflict(error) {
  return (
    error?.code === "40001" ||
    String(error?.message || "").includes("shader_state_conflict")
  );
}
