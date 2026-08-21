import { appItemPathname, parseAppRoute } from "../lib/appRoutes.js";
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

async function attachAuthorProfiles(client, shaders) {
  const ownerIds = [
    ...new Set(shaders.map((shader) => shader.owner_id).filter(Boolean)),
  ];
  if (!ownerIds.length) return shaders;

  const result = await client
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", ownerIds);
  if (result.error) return shaders;

  const profiles = new Map(
    result.data.map((profile) => [profile.id, profile])
  );
  return shaders.map((shader) => ({
    ...shader,
    author_name: profiles.get(shader.owner_id)?.display_name || null,
    author_avatar_url: profiles.get(shader.owner_id)?.avatar_url || null,
  }));
}

const LIBRARY_SHADER_LIMIT = 200;

export async function listShaders({ limit = LIBRARY_SHADER_LIMIT } = {}) {
  const client = requireClient();
  const shaders = unwrap(
    await client
      .from("shaders")
      .select(
        "id, owner_id, name, kind, is_public, thumbnail_path, input_path, input_mime_type, parameter_values, composition, figma_shader_id, figma_shader_kind, figma_shader_version, state_revision, versioned_state_revision, created_at, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(Math.max(1, Math.min(Number(limit) || LIBRARY_SHADER_LIMIT, 500)))
  );
  return attachAuthorProfiles(client, shaders);
}

export async function getProfile(id) {
  const client = requireClient();
  return unwrap(
    await client
      .from("profiles")
      .select("id, display_name")
      .eq("id", id)
      .maybeSingle()
  );
}

export async function saveProfile(id, displayName) {
  const client = requireClient();
  return unwrap(
    await client
      .from("profiles")
      .upsert(
        { id, display_name: displayName, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      )
      .select("id, display_name")
      .single()
  );
}

export async function getShader(id) {
  const client = requireClient();
  return unwrap(
    await client.from("shaders").select("*").eq("id", id).single()
  );
}

export async function getShaderMaybe(id) {
  const client = requireClient();
  return unwrap(
    await client.from("shaders").select("*").eq("id", id).maybeSingle()
  );
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

export async function updateShader(id, payload) {
  const client = requireClient();
  return unwrap(
    await client.from("shaders").update(payload).eq("id", id).select().single()
  );
}

export async function saveShaderState({
  shaderId,
  expectedStateRevision,
  source,
  kind,
  parameterValues,
  features,
  composition = {},
  checkpointKind = null,
  summary = null,
}) {
  const client = requireClient();
  return unwrap(
    await client.rpc("save_shader_state", {
      p_shader_id: shaderId,
      p_expected_state_revision: expectedStateRevision ?? null,
      p_source: source,
      p_kind: kind,
      p_parameter_values: parameterValues || {},
      p_features: features || {},
      p_checkpoint_kind: checkpointKind,
      p_summary: summary,
      p_composition: composition || {},
    })
  );
}

export async function getShadersByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return [];
  const client = requireClient();
  return unwrap(
    await client.from("shaders").select("*").in("id", unique)
  );
}

export async function listShaderVersions(
  shaderId,
  { beforeVersion = null, limit = 50 } = {}
) {
  const client = requireClient();
  let query = client
    .from("shader_versions")
    .select(
      "id, shader_id, version_number, state_revision, checkpoint_kind, summary, restored_from_version_id, created_at"
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
      .select("*")
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

export async function uploadAsset({
  ownerId,
  shaderId,
  role,
  blob,
  fileName,
  contentType,
}) {
  const client = requireClient();
  const extension =
    fileName?.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    (contentType === "image/webp" ? "webp" : "bin");
  const path = `${ownerId}/${shaderId}/${role}.${extension}`;
  unwrap(
    await client.storage.from(ASSET_BUCKET).upload(path, blob, {
      upsert: true,
      contentType: contentType || blob.type || "application/octet-stream",
      cacheControl: role === "thumbnail" ? "3600" : "60",
    })
  );
  return path;
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
  unwrap(await client.storage.from(ASSET_BUCKET).remove(filtered));
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
