import {
  normalizeComposition,
  parseCompositionShaderId,
  referencedShaderKeys,
} from "./composition.js";
import { inferFeatures } from "../runtime/params.js";

function aliases(value) {
  const parsed = parseCompositionShaderId(value);
  if (!parsed) return [value].filter(Boolean);
  const bare = String(parsed.id || "").replace(/^(cloud:|draft:)/, "");
  return [
    value,
    parsed.key,
    parsed.id,
    bare,
    bare ? `cloud:${bare}` : null,
    bare ? `draft:${bare}` : null,
  ].filter(Boolean);
}

function lookupMap(map, key) {
  for (const alias of aliases(key)) {
    const value = map?.get?.(alias);
    if (value) return value;
  }
  return null;
}

export function dependencySnapshotForKey(snapshots, key) {
  if (!snapshots || typeof snapshots !== "object") return null;
  for (const alias of aliases(key)) {
    const value = snapshots[alias];
    if (value && typeof value === "object") return value;
  }
  return null;
}

export function dependencySourceForKey(snapshots, key) {
  const snapshot = dependencySnapshotForKey(snapshots, key);
  return typeof snapshot?.source === "string" && snapshot.source
    ? snapshot.source
    : null;
}

export function resolvedByKeyWithDependencySnapshots(
  resolvedByKey = new Map(),
  snapshots = {},
) {
  const resolved = new Map(resolvedByKey || []);
  if (!snapshots || typeof snapshots !== "object") return resolved;
  for (const [key, snapshot] of Object.entries(snapshots)) {
    if (!snapshot || typeof snapshot !== "object") continue;
    const current = lookupMap(resolved, key);
    const pinned = {
      ...(current || {}),
      ...structuredClone(snapshot),
      key,
      broken: false,
    };
    if (typeof pinned.source === "string" && pinned.source) {
      pinned.features = inferFeatures(pinned.source);
    }
    for (const alias of aliases(key)) resolved.set(alias, pinned);
  }
  return resolved;
}

function durableSnapshot(row, fallbackKey) {
  if (!row || typeof row !== "object" || typeof row.source !== "string") {
    return null;
  }
  const parsed = parseCompositionShaderId(fallbackKey);
  return {
    shader_id:
      row.shader_id ||
      row.id ||
      (parsed ? String(parsed.id || "").replace(/^(cloud:|draft:)/, "") : null),
    state_revision:
      Number.isFinite(Number(row.state_revision))
        ? Number(row.state_revision)
        : null,
    source: row.source,
    kind:
      row.kind === "fill" || row.kind === "composition"
        ? row.kind
        : "effect",
    parameter_values:
      row.parameter_values && typeof row.parameter_values === "object"
        ? structuredClone(row.parameter_values)
        : {},
    features: inferFeatures(row.source),
    composition:
      row.composition && typeof row.composition === "object"
        ? structuredClone(row.composition)
        : {},
    input_path:
      typeof row.input_path === "string" && row.input_path
        ? row.input_path
        : null,
    input_name:
      typeof row.input_name === "string" && row.input_name
        ? row.input_name
        : null,
    input_mime_type:
      typeof row.input_mime_type === "string" && row.input_mime_type
        ? row.input_mime_type
        : null,
  };
}

/**
 * Capture the exact referenced module revisions used by a composition.
 * Existing pins win so saving a restored version does not silently advance it.
 */
export function buildCompositionDependencySnapshots({
  graph,
  resolvedByKey = new Map(),
  liveByKey = new Map(),
  cloudRows = [],
  existingSnapshots = {},
} = {}) {
  const rowsByKey = new Map();
  for (const row of cloudRows || []) {
    for (const key of aliases(row?.key || row?.id)) {
      rowsByKey.set(key, row);
    }
  }
  const snapshots = {};
  for (const key of referencedShaderKeys(normalizeComposition(graph))) {
    const existing = dependencySnapshotForKey(existingSnapshots, key);
    const resolved =
      existing ||
      lookupMap(liveByKey, key) ||
      lookupMap(resolvedByKey, key) ||
      lookupMap(rowsByKey, key);
    const snapshot = durableSnapshot(resolved, key);
    if (snapshot) snapshots[key] = snapshot;
  }
  return snapshots;
}

/** Map each parent layer id to its pinned source for compilation. */
export function dependencyLayerSourceOverrides(graph, snapshots) {
  const normalized = normalizeComposition(graph);
  const overrides = new Map();
  for (const layer of [...normalized.fills, ...normalized.effects]) {
    const snapshot = dependencySnapshotForKey(snapshots, layer.shaderId);
    if (typeof snapshot?.source === "string" && snapshot.source) {
      overrides.set(layer.id, snapshot.source);
    }
  }
  return overrides;
}

function collectAssetPaths(value, out, seen) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (
      (key === "assetPath" || key === "input_path") &&
      typeof child === "string" &&
      child
    ) {
      out.add(child);
    } else {
      collectAssetPaths(child, out, seen);
    }
  }
}

export function dependencySnapshotAssetPaths(snapshots) {
  const paths = new Set();
  collectAssetPaths(snapshots, paths, new Set());
  return [...paths];
}
