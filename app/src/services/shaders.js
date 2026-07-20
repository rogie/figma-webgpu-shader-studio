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

export async function listShaders(ownerId) {
  const client = requireClient();
  return unwrap(
    await client
      .from("shaders")
      .select("*")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false })
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

export function makeShareUrl(id) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("shader", id);
  return url.toString();
}
