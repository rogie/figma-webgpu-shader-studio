import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  logLevel: "silent",
  server: { middlewareMode: true },
});
after(() => vite.close());

const {
  SHADER_DOCUMENT_COLUMNS,
  SHADER_LIBRARY_COLUMNS,
  buildSaveShaderStateRpcArgs,
  contentAddressedAssetPath,
  getShader,
  getShaderMaybe,
  getShadersByIds,
  getThumbnailUrls,
  listPublicShaderGraphs,
  listShaders,
  updateShader,
  uploadAsset,
} = await vite.ssrLoadModule("/src/services/shaders.js");

function updateClient(data) {
  const calls = [];
  const query = {
    eq(column, value) {
      calls.push(["eq", column, value]);
      return query;
    },
    select() {
      calls.push(["select"]);
      return query;
    },
    async maybeSingle() {
      calls.push(["maybeSingle"]);
      return { data, error: null };
    },
  };
  return {
    calls,
    from(table) {
      calls.push(["from", table]);
      return {
        update(payload) {
          calls.push(["update", payload]);
          return query;
        },
      };
    },
  };
}

test("content-addressed asset paths are immutable and role-scoped", async () => {
  const cryptoApi = {
    subtle: {
      async digest(_algorithm, buffer) {
        const bytes = new Uint8Array(buffer);
        const digest = new Uint8Array(32);
        digest.fill(bytes.reduce((sum, byte) => (sum + byte) % 256, 0));
        return digest.buffer;
      },
    },
  };
  const input = {
    ownerId: "owner",
    shaderId: "shader",
    role: "fill/photo",
    blob: new Blob(["pixels"], { type: "image/png" }),
    fileName: "photo.png",
    contentType: "image/png",
    cryptoApi,
  };
  const first = await contentAddressedAssetPath(input);
  const second = await contentAddressedAssetPath(input);
  const changed = await contentAddressedAssetPath({
    ...input,
    blob: new Blob(["different"], { type: "image/png" }),
  });

  assert.equal(first, second);
  assert.match(
    first,
    /^owner\/shader\/assets\/fill-photo-[a-f0-9]{64}\.png$/,
  );
  assert.notEqual(first, changed);
});

test("an idempotent immutable upload accepts an existing object", async () => {
  const calls = [];
  const client = {
    storage: {
      from(bucket) {
        calls.push(["from", bucket]);
        return {
          async upload(path, _blob, options) {
            calls.push(["upload", path, options]);
            return {
              data: null,
              error: { statusCode: "409", message: "The resource already exists" },
            };
          },
        };
      },
    },
  };
  const cryptoApi = {
    subtle: {
      async digest() {
        return new Uint8Array(32).fill(1).buffer;
      },
    },
  };

  const path = await uploadAsset({
    ownerId: "owner",
    shaderId: "shader",
    role: "input",
    blob: new Blob(["pixels"], { type: "image/png" }),
    fileName: "photo.png",
    contentType: "image/png",
    cryptoApi,
    client,
  });

  assert.match(path, /^owner\/shader\/assets\/input-[a-f0-9]{64}\.png$/);
  assert.equal(calls[0][1], "shader-assets");
  assert.equal(calls[1][2].upsert, false);
});

test("thumbnail URLs are public and stable only for public bucket rows", async () => {
  const calls = [];
  const client = {
    storage: {
      from(bucket) {
        return {
          getPublicUrl(path) {
            calls.push(["public", bucket, path]);
            return { data: { publicUrl: `https://cdn.test/${path}` } };
          },
          async createSignedUrls(paths, expiresIn) {
            calls.push(["signed", bucket, paths, expiresIn]);
            return {
              data: paths.map((path) => ({
                path,
                signedUrl: `https://signed.test/${path}`,
              })),
              error: null,
            };
          },
        };
      },
    },
  };

  const urls = await getThumbnailUrls(
    [
      {
        id: "public",
        thumbnail_bucket: "shader-thumbnails",
        thumbnail_path: "owner/public/assets/thumbnail-a.webp",
        thumbnail_small_path: "owner/public/assets/thumbnail-small-b.webp",
      },
      {
        id: "private",
        thumbnail_bucket: "shader-assets",
        thumbnail_path: "owner/private/assets/thumbnail-c.webp",
      },
    ],
    { client },
  );

  assert.equal(
    urls.full.public,
    "https://cdn.test/owner/public/assets/thumbnail-a.webp",
  );
  assert.equal(
    urls.small.public,
    "https://cdn.test/owner/public/assets/thumbnail-small-b.webp",
  );
  assert.equal(
    urls.full.private,
    "https://signed.test/owner/private/assets/thumbnail-c.webp",
  );
  assert.equal(calls.filter(([kind]) => kind === "signed").length, 1);
});

test("buildSaveShaderStateRpcArgs includes complete visual state", () => {
  assert.deepEqual(
    buildSaveShaderStateRpcArgs({
      shaderId: "shader-1",
      expectedStateRevision: 7,
      source: "export default class Shader {}",
      kind: "composition",
      parameterValues: { amount: 0.5 },
      features: { isAnimated: true },
      composition: { fills: [{ id: "fill-1" }] },
      inputPath: "owner/shader-1/assets/input.png",
      inputName: "input.png",
      inputMimeType: "image/png",
      dependencySnapshots: {},
      checkpointDependencySnapshots: {
        "dependency-1": { source: "export default class Fill {}" },
      },
      checkpointKind: "manual",
      summary: "Pinned dependency",
    }),
    {
      p_shader_id: "shader-1",
      p_expected_state_revision: 7,
      p_source: "export default class Shader {}",
      p_kind: "composition",
      p_parameter_values: { amount: 0.5 },
      p_features: { isAnimated: true },
      p_checkpoint_kind: "manual",
      p_summary: "Pinned dependency",
      p_composition: { fills: [{ id: "fill-1" }] },
      p_input_path: "owner/shader-1/assets/input.png",
      p_input_name: "input.png",
      p_input_mime_type: "image/png",
      p_dependency_snapshots: {},
      p_checkpoint_dependency_snapshots: {
        "dependency-1": { source: "export default class Fill {}" },
      },
      p_input_fields_present: true,
    }
  );
});

test("buildSaveShaderStateRpcArgs preserves omitted optional state", () => {
  const args = buildSaveShaderStateRpcArgs({
    shaderId: "shader-1",
    source: "source",
    kind: "effect",
  });

  assert.equal(args.p_expected_state_revision, null);
  assert.deepEqual(args.p_parameter_values, {});
  assert.deepEqual(args.p_features, {});
  assert.deepEqual(args.p_composition, {});
  assert.equal(args.p_input_path, null);
  assert.equal(args.p_input_name, null);
  assert.equal(args.p_input_mime_type, null);
  assert.equal(args.p_dependency_snapshots, null);
  assert.equal(args.p_checkpoint_dependency_snapshots, null);
  assert.equal(args.p_input_fields_present, false);
});

test("buildSaveShaderStateRpcArgs distinguishes an explicit media clear", () => {
  const args = buildSaveShaderStateRpcArgs({
    shaderId: "shader-1",
    source: "source",
    kind: "effect",
    inputPath: null,
    inputName: null,
    inputMimeType: null,
    dependencySnapshots: {},
  });

  assert.equal(args.p_input_fields_present, true);
  assert.equal(args.p_input_path, null);
  assert.equal(args.p_input_name, null);
  assert.equal(args.p_input_mime_type, null);
  assert.deepEqual(args.p_dependency_snapshots, {});
});

function shaderReadClient({
  shader = null,
  shaders = null,
  profiles = [],
  profileError = null,
}) {
  const calls = [];
  const shaderQuery = {
    select(columns) {
      calls.push(["select", columns]);
      return shaderQuery;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return shaderQuery;
    },
    order() {
      return shaderQuery;
    },
    limit() {
      return Promise.resolve({
        data: shaders ?? (shader ? [shader] : []),
        error: null,
      });
    },
    in() {
      return Promise.resolve({
        data: shaders ?? (shader ? [shader] : []),
        error: null,
      });
    },
    async single() {
      return { data: shader, error: null };
    },
    async maybeSingle() {
      return { data: shader, error: null };
    },
  };
  return {
    calls,
    from(table) {
      calls.push(["from", table]);
      if (table === "shaders") return shaderQuery;
      return {
        select() {
          return {
            async in() {
              return { data: profiles, error: profileError };
            },
          };
        },
      };
    },
  };
}

test("getShader attaches the public author profile for logged-out viewers", async () => {
  const client = shaderReadClient({
    shader: { id: "shader-1", owner_id: "owner-1", name: "CRT (1P)" },
    profiles: [
      {
        id: "owner-1",
        display_name: "rogie",
        avatar_url: "https://avatars.githubusercontent.com/u/1577835?v=4",
        handle: "rogie",
      },
    ],
  });

  const loaded = await getShader("shader-1", { client });

  assert.equal(loaded.author_name, "rogie");
  assert.equal(
    loaded.author_avatar_url,
    "https://avatars.githubusercontent.com/u/1577835?v=4",
  );
  assert.equal(loaded.author_handle, "rogie");
  assert.deepEqual(
    client.calls.filter((call) => call[0] === "from"),
    [
      ["from", "shaders"],
      ["from", "profiles"],
    ],
  );
});

test("getShaderMaybe leaves a missing shader as null", async () => {
  const client = shaderReadClient({ shader: null });
  const loaded = await getShaderMaybe("missing", { client });
  assert.equal(loaded, null);
  assert.deepEqual(
    client.calls.filter((call) => call[0] === "from"),
    [["from", "shaders"]],
  );
});

test("getShadersByIds attaches author profiles to each shader", async () => {
  const client = shaderReadClient({
    shaders: [
      { id: "shader-1", owner_id: "owner-1" },
      { id: "shader-2", owner_id: "owner-2" },
    ],
    profiles: [
      {
        id: "owner-1",
        display_name: "rogie",
        avatar_url: "https://example.com/rogie.png",
        handle: "rogie",
      },
      {
        id: "owner-2",
        display_name: "other",
        avatar_url: "https://example.com/other.png",
        handle: "other",
      },
    ],
  });

  const loaded = await getShadersByIds(["shader-1", "shader-2"], { client });
  assert.equal(loaded[0].author_name, "rogie");
  assert.equal(loaded[1].author_avatar_url, "https://example.com/other.png");
  assert.equal(
    client.calls.find((call) => call[0] === "select")[1],
    SHADER_DOCUMENT_COLUMNS,
  );
});

test("listShaders omits source, composition, and dependency snapshots", async () => {
  const client = shaderReadClient({
    shaders: [{ id: "shader-1", owner_id: "owner-1" }],
    profiles: [
      {
        id: "owner-1",
        display_name: "rogie",
        avatar_url: null,
        handle: "rogie",
      },
    ],
  });

  await listShaders({ client });
  const columns = client.calls.find((call) => call[0] === "select")[1];
  assert.equal(columns, SHADER_LIBRARY_COLUMNS);
  assert.equal(columns.includes("source"), false);
  assert.equal(columns.includes("composition"), false);
  assert.equal(columns.includes("dependency_snapshots"), false);
  assert.equal(columns.includes("parameter_values"), false);
});

test("listPublicShaderGraphs loads only public composition refs", async () => {
  const client = shaderReadClient({
    shaders: [{ id: "parent", name: "CRT", kind: "composition", is_public: true }],
  });
  await listPublicShaderGraphs({ client });
  assert.deepEqual(
    client.calls.filter((call) => call[0] === "eq"),
    [["eq", "is_public", true]],
  );
  assert.match(
    client.calls.find((call) => call[0] === "select")[1],
    /composition/,
  );
  assert.equal(
    client.calls.find((call) => call[0] === "select")[1].includes("source"),
    false,
  );
});

test("getShader fetches the visual document instead of select *", async () => {
  const client = shaderReadClient({
    shader: { id: "shader-1", owner_id: "owner-1" },
    profiles: [],
  });
  await getShader("shader-1", { client });
  assert.equal(
    client.calls.find((call) => call[0] === "select")[1],
    SHADER_DOCUMENT_COLUMNS,
  );
});

test("metadata updates reject an intervening visual state revision", async () => {
  const successClient = updateClient({
    id: "shader-1",
    state_revision: 8,
    name: "Renamed",
  });
  const saved = await updateShader(
    "shader-1",
    { name: "Renamed" },
    { expectedStateRevision: 8, client: successClient },
  );
  assert.equal(saved.name, "Renamed");
  assert.deepEqual(
    successClient.calls.filter((call) => call[0] === "eq"),
    [
      ["eq", "id", "shader-1"],
      ["eq", "state_revision", 8],
    ],
  );

  const conflictClient = updateClient(null);
  await assert.rejects(
    updateShader(
      "shader-1",
      { name: "Stale rename" },
      { expectedStateRevision: 8, client: conflictClient },
    ),
    (error) =>
      error.code === "40001" && error.message === "shader_state_conflict",
  );
});
