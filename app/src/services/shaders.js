import { supabase } from "../lib/supabase.js";
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
  if (result.error) throw result.error;
  return result.data;
}

async function attachAuthorProfiles(client, shaders) {
  const ownerIds = [
    ...new Set(shaders.map((shader) => shader.owner_id).filter(Boolean)),
  ];
  if (!ownerIds.length) return shaders;

  const result = await client
    .from("profiles")
    .select("*")
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

export async function listShaders() {
  const client = requireClient();
  const shaders = unwrap(
    await client
      .from("shaders")
      .select(
        "id, owner_id, name, kind, is_public, thumbnail_path, input_path, input_mime_type, parameter_values, figma_shader_id, figma_shader_kind, figma_shader_version, created_at, updated_at"
      )
      .order("updated_at", { ascending: false })
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

const SHADER_ROUTE_PREFIX = "shader/";

function appBasePathname() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).pathname;
}

function shaderPathname(id) {
  const base = appBasePathname();
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}${SHADER_ROUTE_PREFIX}${encodeURIComponent(id)}`;
}

export function makeHomeUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export function getShaderRouteId() {
  const basePath = appBasePathname();
  if (!window.location.pathname.startsWith(basePath)) return null;
  const routePath = window.location.pathname
    .slice(basePath.length)
    .replace(/^\/+/, "")
    .replace(/\/$/, "");
  if (!routePath) return null;

  let idSegment = routePath;
  if (routePath.startsWith(SHADER_ROUTE_PREFIX)) {
    idSegment = routePath.slice(SHADER_ROUTE_PREFIX.length);
  } else if (routePath.includes("/")) {
    return null;
  }

  if (!idSegment) return null;
  try {
    return decodeURIComponent(idSegment);
  } catch {
    return null;
  }
}

export function makeShareUrl(id) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  if (id) url.pathname = shaderPathname(id);
  return url.toString();
}
