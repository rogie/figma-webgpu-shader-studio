import {
  appEmbedPathname,
  appItemPathname,
  appProfilePathname,
  appViewPathname,
  parseAppRoute,
} from "../lib/appRoutes.js";
import {
  isUuid,
  normalizeProfileHandle,
  profileHandleError,
} from "../lib/profileHandles.js";
import { supabase } from "../lib/supabase.js";
import { formatSupabaseError } from "../lib/supabaseFetch.js";
import { shaderPlanPath } from "../lib/chatPlans.js";

export { shaderPlanPath };

export const ASSET_BUCKET = "shader-assets";
export const PLAN_BUCKET = "shader-plans";
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

function requireClient() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  return supabase;
}

function unwrap(result) {
  if (result.error) {
    const error = result.error;
    const wrapped = new Error(formatSupabaseError(error));
    if (error.code) wrapped.code = error.code;
    if (error.details) wrapped.details = error.details;
    if (error.hint) wrapped.hint = error.hint;
    throw wrapped;
  }
  return result.data;
}

/** Library cards: omit source, composition, snapshots, and input blobs. */
export const SHADER_LIBRARY_COLUMNS =
  "id, owner_id, name, description, kind, is_public, thumbnail_path, features, figma_shader_id, figma_shader_kind, figma_shader_version, state_revision, versioned_state_revision, created_at, updated_at";

/** Editor, view, and embed: the visual document plus listing metadata. */
export const SHADER_DOCUMENT_COLUMNS =
  "id, owner_id, name, description, source, kind, is_public, thumbnail_path, input_path, input_name, input_mime_type, parameter_values, features, composition, dependency_snapshots, figma_shader_id, figma_shader_kind, figma_shader_version, state_revision, versioned_state_revision, created_at, updated_at";

const PUBLIC_REFERENCE_COLUMNS = "id, name, kind, is_public, composition";

async function attachAuthorProfiles(client, shaders) {
  const ownerIds = [
    ...new Set(shaders.map((shader) => shader.owner_id).filter(Boolean)),
  ];
  if (!ownerIds.length) return shaders;

  const result = await client
    .from("profiles")
    .select("id, display_name, avatar_url, handle")
    .in("id", ownerIds);
  if (result.error) return shaders;

  const profiles = new Map(
    result.data.map((profile) => [profile.id, profile])
  );
  return shaders.map((shader) => ({
    ...shader,
    author_name: profiles.get(shader.owner_id)?.display_name || null,
    author_avatar_url: profiles.get(shader.owner_id)?.avatar_url || null,
    author_handle: profiles.get(shader.owner_id)?.handle || null,
  }));
}

async function attachAuthorProfile(client, shader) {
  if (!shader) return shader;
  const [withAuthor] = await attachAuthorProfiles(client, [shader]);
  return withAuthor;
}

const LIBRARY_SHADER_LIMIT = 200;

export async function listShaders({
  limit = LIBRARY_SHADER_LIMIT,
  client: suppliedClient = null,
} = {}) {
  const client = suppliedClient || requireClient();
  const shaders = unwrap(
    await client
      .from("shaders")
      .select(SHADER_LIBRARY_COLUMNS)
      .order("updated_at", { ascending: false })
      .limit(Math.max(1, Math.min(Number(limit) || LIBRARY_SHADER_LIMIT, 500)))
  );
  return attachAuthorProfiles(client, shaders);
}

export async function listPublicShaderGraphs({
  limit = 500,
  client: suppliedClient = null,
} = {}) {
  const client = suppliedClient || requireClient();
  return unwrap(
    await client
      .from("shaders")
      .select(PUBLIC_REFERENCE_COLUMNS)
      .eq("is_public", true)
      .limit(Math.max(1, Math.min(Number(limit) || 500, 500)))
  );
}

export async function getProfile(id) {
  const client = requireClient();
  return unwrap(
    await client
      .from("profiles")
      .select("id, display_name, avatar_url, handle")
      .eq("id", id)
      .maybeSingle()
  );
}

export async function getProfileByHandleOrId(identifier) {
  const client = requireClient();
  const normalized = normalizeProfileHandle(identifier);
  if (normalized) {
    const byHandle = unwrap(
      await client
        .from("profiles")
        .select("id, display_name, avatar_url, handle")
        .eq("handle", normalized)
        .maybeSingle(),
    );
    if (byHandle) return byHandle;
  }
  if (!isUuid(identifier)) return null;
  return unwrap(
    await client
      .from("profiles")
      .select("id, display_name, avatar_url, handle")
      .eq("id", identifier)
      .maybeSingle(),
  );
}

export async function saveProfile(id, { displayName, handle }) {
  const client = requireClient();
  const normalizedHandle = normalizeProfileHandle(handle);
  const handleError = profileHandleError(normalizedHandle);
  if (handleError) throw new Error(handleError);
  const result = await client
    .from("profiles")
    .upsert(
      {
        id,
        display_name: displayName,
        handle: normalizedHandle,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("id, display_name, avatar_url, handle")
    .single();
  if (result.error?.code === "23505") {
    const error = new Error("That handle is already taken.");
    error.code = result.error.code;
    throw error;
  }
  return unwrap(result);
}

export async function isProfileHandleAvailable(handle, currentUserId = null) {
  const normalizedHandle = normalizeProfileHandle(handle);
  const handleError = profileHandleError(normalizedHandle);
  if (handleError) return false;
  const client = requireClient();
  const profile = unwrap(
    await client
      .from("profiles")
      .select("id")
      .eq("handle", normalizedHandle)
      .maybeSingle(),
  );
  return !profile || profile.id === currentUserId;
}

export async function listProfileShaders(
  ownerId,
  { includePrivate = false, offset = 0, limit = 48 } = {},
) {
  const client = requireClient();
  const pageSize = Math.max(1, Math.min(Number(limit) || 48, 100));
  const pageOffset = Math.max(0, Number(offset) || 0);
  let query = client
    .from("shaders")
    .select(SHADER_LIBRARY_COLUMNS, { count: "exact" })
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  if (!includePrivate) query = query.eq("is_public", true);
  const result = await query.range(pageOffset, pageOffset + pageSize - 1);
  const shaders = unwrap(result);
  return {
    shaders: await attachAuthorProfiles(client, shaders),
    total: result.count ?? shaders.length,
  };
}

export async function getProfileShaderCounts(
  ownerId,
  { includePrivate = false } = {},
) {
  const client = requireClient();
  const countKind = async (kind) => {
    let query = client
      .from("shaders")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("kind", kind);
    if (!includePrivate) query = query.eq("is_public", true);
    const result = await query;
    unwrap(result);
    return result.count || 0;
  };
  const [compositions, effects, fills] = await Promise.all([
    countKind("composition"),
    countKind("effect"),
    countKind("fill"),
  ]);
  return { compositions, effects, fills };
}

export async function getShader(id, { client: suppliedClient = null } = {}) {
  const client = suppliedClient || requireClient();
  const shader = unwrap(
    await client
      .from("shaders")
      .select(SHADER_DOCUMENT_COLUMNS)
      .eq("id", id)
      .single()
  );
  return attachAuthorProfile(client, shader);
}

export async function getShaderMaybe(id, { client: suppliedClient = null } = {}) {
  const client = suppliedClient || requireClient();
  const shader = unwrap(
    await client
      .from("shaders")
      .select(SHADER_DOCUMENT_COLUMNS)
      .eq("id", id)
      .maybeSingle()
  );
  return attachAuthorProfile(client, shader);
}

export async function createShader(payload) {
  const client = requireClient();
  return unwrap(
    await client.from("shaders").insert(payload).select().single()
  );
}

export async function upsertShader(payload) {
  const client = requireClient();
  return unwrap(
    await client
      .from("shaders")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single()
  );
}

function shaderStateConflictError() {
  const error = new Error("shader_state_conflict");
  error.code = "40001";
  return error;
}

export async function updateShader(
  id,
  payload,
  { expectedStateRevision = null, client: suppliedClient = null } = {},
) {
  const client = suppliedClient || requireClient();
  let query = client.from("shaders").update(payload).eq("id", id);
  if (expectedStateRevision != null) {
    query = query.eq("state_revision", expectedStateRevision);
  }
  const data = unwrap(await query.select().maybeSingle());
  if (!data && expectedStateRevision != null) {
    throw shaderStateConflictError();
  }
  return data;
}

export function buildSaveShaderStateRpcArgs(options = {}) {
  const {
    shaderId,
    expectedStateRevision,
    source,
    kind,
    parameterValues,
    features,
    composition = {},
    inputPath,
    inputName,
    inputMimeType,
    dependencySnapshots,
    checkpointDependencySnapshots,
    checkpointKind = null,
    summary = null,
  } = options;
  const inputFieldsPresent = [
    "inputPath",
    "inputName",
    "inputMimeType",
  ].some((key) => Object.prototype.hasOwnProperty.call(options, key));

  return {
    p_shader_id: shaderId,
    p_expected_state_revision: expectedStateRevision ?? null,
    p_source: source,
    p_kind: kind,
    p_parameter_values: parameterValues ?? {},
    p_features: features ?? {},
    p_checkpoint_kind: checkpointKind,
    p_summary: summary,
    p_composition: composition ?? {},
    p_input_path: inputPath ?? null,
    p_input_name: inputName ?? null,
    p_input_mime_type: inputMimeType ?? null,
    p_dependency_snapshots: dependencySnapshots ?? null,
    p_checkpoint_dependency_snapshots:
      checkpointDependencySnapshots ?? null,
    p_input_fields_present: inputFieldsPresent,
  };
}

export async function saveShaderState(options) {
  const client = requireClient();
  return unwrap(
    await client.rpc(
      "save_shader_state",
      buildSaveShaderStateRpcArgs(options)
    )
  );
}

export async function getShadersByIds(
  ids,
  { client: suppliedClient = null } = {},
) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return [];
  const client = suppliedClient || requireClient();
  const shaders = unwrap(
    await client
      .from("shaders")
      .select(SHADER_DOCUMENT_COLUMNS)
      .in("id", unique)
  );
  return attachAuthorProfiles(client, shaders);
}

export async function listShaderVersions(
  shaderId,
  { beforeVersion = null, limit = 50 } = {}
) {
  const client = requireClient();
  let query = client
    .from("shader_versions")
    .select(
      "id, shader_id, version_number, state_revision, checkpoint_kind, summary, restored_from_version_id, snapshot_schema_version, created_at"
    )
    .eq("shader_id", shaderId)
    .order("version_number", { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 50, 100)));
  if (beforeVersion != null) {
    query = query.lt("version_number", Number(beforeVersion));
  }
  return unwrap(await query);
}

export async function listAllShaderVersions(shaderId) {
  const versions = [];
  let beforeVersion = null;
  while (true) {
    const page = await listShaderVersions(shaderId, {
      beforeVersion,
      limit: 100,
    });
    versions.push(...page);
    if (page.length < 100) return versions;
    beforeVersion = page[page.length - 1].version_number;
  }
}

export async function getShaderVersion(shaderId, versionId) {
  const client = requireClient();
  return unwrap(
    await client
      .from("shader_versions")
      .select(
        "id, shader_id, version_number, state_revision, checkpoint_kind, summary, source, kind, parameter_values, features, composition, input_path, input_name, input_mime_type, dependency_snapshots, snapshot_schema_version, restored_from_version_id, created_at",
      )
      .eq("shader_id", shaderId)
      .eq("id", versionId)
      .single()
  );
}

export async function restoreShaderVersion({
  shaderId,
  versionId,
  expectedStateRevision,
}) {
  const client = requireClient();
  return unwrap(
    await client.rpc("restore_shader_version", {
      p_shader_id: shaderId,
      p_version_id: versionId,
      p_expected_state_revision: expectedStateRevision ?? null,
    })
  );
}

export async function deleteShader(id) {
  const client = requireClient();
  unwrap(await client.from("shaders").delete().eq("id", id));
}

function assetExtension(fileName, contentType) {
  const mimeExtensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return (
    mimeExtensions[contentType] ||
    fileName?.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "bin"
  );
}

async function sha256Hex(blob, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle?.digest) {
    throw new Error("Secure asset hashing is unavailable in this browser.");
  }
  const digest = await cryptoApi.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function contentAddressedAssetPath({
  ownerId,
  shaderId,
  role,
  blob,
  fileName,
  contentType,
  cryptoApi = globalThis.crypto,
}) {
  const safeRole =
    String(role || "asset")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/^-+|-+$/g, "") || "asset";
  const extension = assetExtension(
    fileName,
    contentType || blob?.type || "application/octet-stream"
  );
  const digest = await sha256Hex(blob, cryptoApi);
  return `${ownerId}/${shaderId}/assets/${safeRole}-${digest}.${extension}`;
}

function isDuplicateAssetError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.statusCode === "409" ||
    error?.status === 409 ||
    message.includes("duplicate") ||
    message.includes("already exists")
  );
}

export async function uploadAsset({
  ownerId,
  shaderId,
  role,
  blob,
  fileName,
  contentType,
  cryptoApi = globalThis.crypto,
  client: suppliedClient = null,
}) {
  const client = suppliedClient || requireClient();
  const path = await contentAddressedAssetPath({
    ownerId,
    shaderId,
    role,
    blob,
    fileName,
    contentType,
    cryptoApi,
  });
  const result = await client.storage.from(ASSET_BUCKET).upload(path, blob, {
      upsert: false,
      contentType: contentType || blob.type || "application/octet-stream",
      cacheControl: "31536000",
    });
  if (result.error && !isDuplicateAssetError(result.error)) unwrap(result);
  return path;
}

async function listAssetFolder(client, prefix) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = unwrap(
      await client.storage.from(ASSET_BUCKET).list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      })
    );
    rows.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  const paths = [];
  for (const row of rows || []) {
    const path = `${prefix}/${row.name}`;
    if (row.id || row.metadata) {
      paths.push(path);
    } else {
      paths.push(...(await listAssetFolder(client, path)));
    }
  }
  return paths;
}

export async function listShaderAssetPaths(ownerId, shaderId) {
  if (!ownerId || !shaderId) return [];
  return listAssetFolder(requireClient(), `${ownerId}/${shaderId}`);
}

export async function listRetainedShaderAssetPaths(shaderId) {
  if (!shaderId) return [];
  const paths = unwrap(
    await requireClient().rpc("retained_shader_asset_paths", {
      p_shader_id: shaderId,
    })
  );
  return Array.isArray(paths) ? paths.filter(Boolean) : [];
}

export async function removeShaderAssets({
  ownerId,
  shaderId,
  retainPaths = [],
}) {
  const retained = new Set(retainPaths);
  const paths = (await listShaderAssetPaths(ownerId, shaderId)).filter(
    (path) => !retained.has(path)
  );
  await removeAssets(paths);
  return paths;
}

export async function uploadShaderPlan({ ownerId, shaderId, markdown }) {
  const client = requireClient();
  const path = shaderPlanPath(ownerId, shaderId);
  unwrap(
    await client.storage
      .from(PLAN_BUCKET)
      .upload(path, new Blob([markdown], { type: "text/markdown" }), {
        upsert: true,
        contentType: "text/markdown",
        cacheControl: "60",
      })
  );
  return path;
}

export async function downloadShaderPlan(ownerId, shaderId) {
  const blob = unwrap(
    await requireClient()
      .storage.from(PLAN_BUCKET)
      .download(shaderPlanPath(ownerId, shaderId))
  );
  return blob.text();
}

export async function removeShaderPlan(ownerId, shaderId) {
  unwrap(
    await requireClient()
      .storage.from(PLAN_BUCKET)
      .remove([shaderPlanPath(ownerId, shaderId)])
  );
}

export async function removeAssets(paths) {
  const filtered = paths.filter(Boolean);
  if (!filtered.length) return;
  const client = requireClient();
  for (let offset = 0; offset < filtered.length; offset += 1000) {
    unwrap(
      await client.storage
        .from(ASSET_BUCKET)
        .remove(filtered.slice(offset, offset + 1000))
    );
  }
}

export async function downloadAsset(path) {
  const client = requireClient();
  return unwrap(await client.storage.from(ASSET_BUCKET).download(path));
}

export async function getAssetUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const client = requireClient();
  const data = unwrap(
    await client.storage
      .from(ASSET_BUCKET)
      .createSignedUrl(path, expiresIn)
  );
  return data.signedUrl;
}

export async function getAssetUrls(paths, expiresIn = 3600) {
  const filtered = [...new Set(paths.filter(Boolean))];
  if (!filtered.length) return {};
  const client = requireClient();
  const rows = unwrap(
    await client.storage
      .from(ASSET_BUCKET)
      .createSignedUrls(filtered, expiresIn)
  );
  return Object.fromEntries(
    rows
      .filter((row) => row?.path && row?.signedUrl)
      .map((row) => [row.path, row.signedUrl])
  );
}

function appBasePathname() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).pathname;
}

export function makeHomeUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export function getAppRoute() {
  return parseAppRoute(window.location.pathname, appBasePathname());
}

export function getShaderRouteId() {
  return getAppRoute().id;
}

export function makeShareUrl(id, kind) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  if (id) url.pathname = appItemPathname(id, kind, appBasePathname());
  return url.toString();
}

export function makeEmbedUrl(id, kind) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  if (id) url.pathname = appEmbedPathname(id, kind, appBasePathname());
  return url.toString();
}

export function makeViewUrl(id, kind) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  if (id) url.pathname = appViewPathname(id, kind, appBasePathname());
  return url.toString();
}

export function makeProfileUrl(identifier) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  if (identifier) {
    url.pathname = appProfilePathname(identifier, appBasePathname());
  }
  return url.toString();
}
