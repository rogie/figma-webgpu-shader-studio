import { supabase } from "../lib/supabase.js";

export const ASSET_BUCKET = "shader-assets";
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
    .select("id, display_name")
    .in("id", ownerIds);
  if (result.error) return shaders;

  const names = new Map(
    result.data.map((profile) => [profile.id, profile.display_name])
  );
  return shaders.map((shader) => ({
    ...shader,
    author_name: names.get(shader.owner_id) || null,
  }));
}

export async function listShaders() {
  const client = requireClient();
  const shaders = unwrap(
    await client
      .from("shaders")
      .select("*")
      .order("updated_at", { ascending: false })
  );
  return attachAuthorProfiles(client, shaders);
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
