import {
  COMPOSITION_KIND,
  hasCompositionGraph,
  normalizeComposition,
} from "./composition.js";
import { persistableEffectFills } from "./effectFillStorage.js";
import {
  persistableDocumentInputs,
  readDocumentInputs,
} from "./documentInputs.js";
import { detectKind, inferFeatures } from "../runtime/params.js";

const EFFECT_KIND = "effect";
const FILL_KIND = "fill";

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneJsonValue(value, ancestors = new WeakSet()) {
  if (value == null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "undefined" || typeof value === "function") {
    return undefined;
  }
  if (typeof value !== "object") return undefined;
  if (ancestors.has(value)) {
    throw new TypeError("Shader document state must not contain circular values.");
  }

  ancestors.add(value);
  let cloned;
  if (Array.isArray(value)) {
    cloned = value.map((item) => {
      const next = cloneJsonValue(item, ancestors);
      return next === undefined ? null : next;
    });
  } else {
    cloned = {};
    for (const key of Object.keys(value)) {
      const next = cloneJsonValue(value[key], ancestors);
      if (next !== undefined) cloned[key] = next;
    }
  }
  ancestors.delete(value);
  return cloned;
}

function cloneRecord(value) {
  const cloned = cloneJsonValue(value);
  return isRecord(cloned) ? cloned : {};
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isRecord(value)) return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = stableJsonValue(value[key]);
  }
  return sorted;
}

function stableStringify(value) {
  return JSON.stringify(stableJsonValue(value));
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function stringOrNull(value) {
  return typeof value === "string" && value ? value : null;
}

function normalizedInput(state) {
  const input = isRecord(state.input) ? state.input : {};
  return {
    path: stringOrNull(
      firstDefined(
        input.path,
        input.inputPath,
        input.input_path,
        state.inputPath,
        state.input_path,
      ),
    ),
    name: stringOrNull(
      firstDefined(
        input.name,
        input.inputName,
        input.input_name,
        state.inputName,
        state.input_name,
      ),
    ),
    mimeType: stringOrNull(
      firstDefined(
        input.mimeType,
        input.mime_type,
        input.inputMimeType,
        input.input_mime_type,
        state.inputMimeType,
        state.input_mime_type,
      ),
    ),
  };
}

function normalizedKind(state, source) {
  const requested = firstDefined(state.kind, state.sessionKind);
  if (
    requested === COMPOSITION_KIND ||
    (requested !== EFFECT_KIND &&
      requested !== FILL_KIND &&
      hasCompositionGraph(state.composition || state.graph))
  ) {
    return COMPOSITION_KIND;
  }
  if (requested === EFFECT_KIND || requested === FILL_KIND) return requested;
  return detectKind(source);
}

function normalizedFeatures(state, kind, source) {
  const supplied = cloneRecord(state.features);
  const inferred =
    kind === COMPOSITION_KIND
      ? { isAnimated: false, usesMouse: false }
      : inferFeatures(source);
  return {
    ...supplied,
    isAnimated:
      supplied.isAnimated === undefined
        ? inferred.isAnimated
        : Boolean(supplied.isAnimated),
    usesMouse:
      supplied.usesMouse === undefined
        ? inferred.usesMouse
        : Boolean(supplied.usesMouse),
    ...(supplied.supportsAudio ? { supportsAudio: true } : {}),
  };
}

function withStableLayerIds(items, prefix) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const candidate = isRecord(item) ? item : {};
    const supplied =
      typeof candidate.id === "string" && candidate.id
        ? candidate.id
        : prefix === "fill" && index === 0
          ? "fill"
          : `${prefix}-${index + 1}`;
    let id = supplied;
    let duplicate = 2;
    while (seen.has(id)) {
      id = `${supplied}-${duplicate}`;
      duplicate += 1;
    }
    seen.add(id);
    return id === candidate.id ? candidate : { ...candidate, id };
  });
}

function selectedEffectFills(state) {
  if (Array.isArray(state.effectFills)) {
    return withStableLayerIds(state.effectFills, "fill");
  }
  if (Object.prototype.hasOwnProperty.call(state, "effectFill")) {
    return isRecord(state.effectFill)
      ? withStableLayerIds([state.effectFill], "fill")
      : [];
  }
  const composition = isRecord(state.composition) ? state.composition : {};
  if (Array.isArray(composition.effectFills)) {
    return withStableLayerIds(composition.effectFills, "fill");
  }
  if (Object.prototype.hasOwnProperty.call(composition, "effectFill")) {
    return isRecord(composition.effectFill)
      ? withStableLayerIds([composition.effectFill], "fill")
      : [];
  }
  return [];
}

function compositionInputs(state) {
  const composition = isRecord(state.composition) ? state.composition : {};
  if (Array.isArray(state.inputs)) return persistableDocumentInputs(state.inputs);
  if (Array.isArray(composition.inputs)) {
    return persistableDocumentInputs(composition.inputs);
  }
  return persistableDocumentInputs(readDocumentInputs(state));
}

function withInputs(payload, inputs) {
  return inputs.length ? { ...payload, inputs } : payload;
}

function normalizedComposition(state, kind) {
  if (kind === FILL_KIND) {
    return withInputs({}, compositionInputs(state));
  }

  if (kind === EFFECT_KIND) {
    const effectFills = cloneJsonValue(
      persistableEffectFills(selectedEffectFills(state)),
    );
    return withInputs(
      {
        effectFills,
        effectFill: effectFills[0] || null,
      },
      compositionInputs(state),
    );
  }

  const sourceGraph = state.composition || state.graph;
  const graphCandidate = isRecord(sourceGraph) ? sourceGraph : {};
  const graph = normalizeComposition({
    ...graphCandidate,
    ...(Array.isArray(graphCandidate.fills)
      ? { fills: withStableLayerIds(graphCandidate.fills, "fill") }
      : {}),
    ...(Array.isArray(graphCandidate.effects)
      ? { effects: withStableLayerIds(graphCandidate.effects, "effect") }
      : {}),
  });
  const fills = cloneJsonValue(persistableEffectFills(graph.fills));
  return withInputs(
    {
      fills,
      fill: fills[0] || null,
      effects: cloneJsonValue(graph.effects),
    },
    persistableDocumentInputs(graph.inputs || compositionInputs(state)),
  );
}

function isShaderDocumentLike(value) {
  if (!isRecord(value)) return false;
  return [
    "source",
    "kind",
    "sessionKind",
    "parameterValues",
    "parameter_values",
    "values",
    "features",
    "composition",
    "input",
    "input_path",
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function dependencyEntries(value) {
  if (value instanceof Map) return [...value.entries()];
  if (isRecord(value)) return Object.entries(value);
  return [];
}

function normalizeDependencySnapshots(value) {
  const snapshots = {};
  const entries = dependencyEntries(value).sort(([left], [right]) =>
    String(left).localeCompare(String(right)),
  );
  for (const [rawKey, candidate] of entries) {
    const key = String(rawKey || "");
    if (!key) continue;
    snapshots[key] = isShaderDocumentLike(candidate)
      ? dependencyPayload(candidate)
      : cloneJsonValue(candidate);
  }
  return snapshots;
}

function normalizedDependencyInput(state) {
  return firstDefined(
    state.dependencySnapshots,
    state.dependency_snapshots,
    {},
  );
}

function normalizeShaderDocument(state = {}) {
  const candidate = isRecord(state) ? state : {};
  const rawSource =
    typeof candidate.source === "string" ? candidate.source : "";
  const kind = normalizedKind(candidate, rawSource);
  const source = kind === COMPOSITION_KIND ? "" : rawSource;
  const rawParameterValues = firstDefined(
    candidate.parameterValues,
    candidate.parameter_values,
    candidate.values,
    {},
  );

  return {
    source,
    kind,
    parameterValues:
      kind === COMPOSITION_KIND ? {} : cloneRecord(rawParameterValues),
    features: normalizedFeatures(candidate, kind, source),
    composition: normalizedComposition(candidate, kind),
    input: normalizedInput(candidate),
    dependencySnapshots: normalizeDependencySnapshots(
      normalizedDependencyInput(candidate),
    ),
  };
}

function rowPayloadFromDocument(document) {
  return {
    source: document.source,
    kind: document.kind,
    parameter_values: cloneRecord(document.parameterValues),
    features: cloneRecord(document.features),
    composition: cloneRecord(document.composition),
    input_path: document.input.path,
    input_name: document.input.name,
    input_mime_type: document.input.mimeType,
    dependency_snapshots: cloneRecord(document.dependencySnapshots),
  };
}

function dependencyPayload(candidate) {
  const payload = rowPayloadFromDocument(normalizeShaderDocument(candidate));
  const shaderId = stringOrNull(
    firstDefined(candidate.shader_id, candidate.shaderId, candidate.id),
  );
  const rawRevision = firstDefined(
    candidate.state_revision,
    candidate.stateRevision,
  );
  const revision =
    rawRevision !== undefined &&
    rawRevision !== null &&
    rawRevision !== "" &&
    Number.isFinite(Number(rawRevision))
      ? Number(rawRevision)
      : null;
  return {
    ...(shaderId ? { shader_id: shaderId } : {}),
    ...(rawRevision !== undefined ? { state_revision: revision } : {}),
    ...payload,
  };
}

/**
 * Capture the complete visual document state used by saves and versions.
 * Metadata such as name, description, publication, thumbnail, and Figma links
 * intentionally stays outside this snapshot.
 */
export function buildShaderDocumentSnapshot(state = {}) {
  const document = normalizeShaderDocument(state);
  return {
    ...document,
    fingerprint: shaderDocumentFingerprint(document),
  };
}

/**
 * Build the snake_case row payload shared by create/migration/duplicate paths.
 */
export function buildShaderDocumentPayload(stateOrSnapshot = {}) {
  return rowPayloadFromDocument(normalizeShaderDocument(stateOrSnapshot));
}

/**
 * Build arguments accepted by the saveShaderState service wrapper.
 */
export function buildShaderStateSavePayload(stateOrSnapshot = {}) {
  const document = normalizeShaderDocument(stateOrSnapshot);
  return {
    source: document.source,
    kind: document.kind,
    parameterValues: cloneRecord(document.parameterValues),
    features: cloneRecord(document.features),
    composition: cloneRecord(document.composition),
    inputPath: document.input.path,
    inputName: document.input.name,
    inputMimeType: document.input.mimeType,
    dependencySnapshots: cloneRecord(document.dependencySnapshots),
  };
}

/**
 * Canonical, order-independent fingerprint. The serialized state is retained
 * rather than hashed, avoiding collision-based false "saved" results.
 */
export function shaderDocumentFingerprint(state = {}) {
  return `shader-document:v1:${stableStringify(normalizeShaderDocument(state))}`;
}

export function editorStateMatchesSnapshot(editorState, capturedSnapshot) {
  if (!capturedSnapshot || typeof capturedSnapshot !== "object") return false;
  const capturedFingerprint =
    typeof capturedSnapshot.fingerprint === "string"
      ? capturedSnapshot.fingerprint
      : shaderDocumentFingerprint(capturedSnapshot);
  return shaderDocumentFingerprint(editorState) === capturedFingerprint;
}

/**
 * Canonicalize resolved dependency rows before embedding them in a document
 * checkpoint. Object/Map keys are preserved as shader reference keys.
 */
export function buildShaderDependencySnapshots(dependencies = {}) {
  if (Array.isArray(dependencies)) {
    const byKey = {};
    for (const dependency of dependencies) {
      if (!isRecord(dependency)) continue;
      const id = stringOrNull(firstDefined(dependency.key, dependency.id));
      if (!id) continue;
      const key =
        id.startsWith("cloud:") || id.startsWith("draft:")
          ? id
          : `cloud:${id}`;
      byKey[key] = dependency;
    }
    return normalizeDependencySnapshots(byKey);
  }
  return normalizeDependencySnapshots(dependencies);
}
