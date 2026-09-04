import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import sharp from "sharp";

const SOURCE_BUCKET = "shader-assets";
const TARGET_BUCKET = "shader-thumbnails";
const PAGE_SIZE = 100;
const apply = process.argv.includes("--apply");
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.",
  );
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function retryStorage(operation, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await operation();
      if (!result.error) return result;
      throw result.error;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || error?.statusCode);
      if ((status < 500 && status !== 429) || attempt === attempts - 1) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * 2 ** attempt),
      );
    }
  }
  throw lastError;
}

let offset = 0;
let discovered = 0;
let migrated = 0;

while (true) {
  const { data: shaders, error } = await client
    .from("shaders")
    .select("id, thumbnail_path, thumbnail_small_path, thumbnail_bucket")
    .eq("is_public", true)
    .not("thumbnail_path", "is", null)
    .or(
      `thumbnail_bucket.neq.${TARGET_BUCKET},thumbnail_small_path.is.null`,
    )
    .order("id")
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) throw error;
  if (!shaders?.length) break;
  discovered += shaders.length;

  for (const shader of shaders) {
    if (!apply) {
      console.log(`[dry-run] ${shader.id}: ${shader.thumbnail_path}`);
      continue;
    }
    const sourceBucket = shader.thumbnail_bucket || SOURCE_BUCKET;
    const download = await retryStorage(() =>
      client.storage.from(sourceBucket).download(shader.thumbnail_path),
    );
    if (sourceBucket !== TARGET_BUCKET) {
      await retryStorage(() =>
        client.storage
          .from(TARGET_BUCKET)
          .upload(shader.thumbnail_path, download.data, {
            cacheControl: "31536000",
            contentType: download.data.type || "image/webp",
            upsert: true,
          }),
      );
    }
    const smallBytes = await sharp(
      Buffer.from(await download.data.arrayBuffer()),
    )
      .resize(128, 128, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
    const smallHash = createHash("sha256").update(smallBytes).digest("hex");
    const directory = shader.thumbnail_path.slice(
      0,
      shader.thumbnail_path.lastIndexOf("/"),
    );
    const thumbnailSmallPath =
      `${directory}/thumbnail-small-${smallHash}.webp`;
    await retryStorage(() =>
      client.storage.from(TARGET_BUCKET).upload(thumbnailSmallPath, smallBytes, {
        cacheControl: "31536000",
        contentType: "image/webp",
        upsert: true,
      }),
    );
    const update = await client
      .from("shaders")
      .update({
        thumbnail_bucket: TARGET_BUCKET,
        thumbnail_small_path: thumbnailSmallPath,
      })
      .eq("id", shader.id);
    if (update.error) throw update.error;
    migrated += 1;
    console.log(`[migrated] ${shader.id}`);
  }

  if (shaders.length < PAGE_SIZE) break;
  if (!apply) offset += PAGE_SIZE;
}

console.log(
  apply
    ? `Migrated ${migrated} of ${discovered} published thumbnails.`
    : `Found ${discovered} published thumbnails. Re-run with --apply to migrate.`,
);
