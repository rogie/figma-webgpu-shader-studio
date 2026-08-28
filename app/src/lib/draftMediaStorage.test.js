import assert from "node:assert/strict";
import test from "node:test";
import {
  annotatePersistedFillMedia,
  createDraftMediaObjectUrl,
  createDraftMediaRecord,
  createDraftMediaStore,
  draftMediaAssetKey,
  draftMediaRecordToFile,
  hydratePersistedFillMedia,
  hydratePersistedFillMediaStack,
  localDraftMediaKeyFromFill,
  parseDraftMediaAssetKey,
  unresolvedLocalDraftMediaKey,
} from "./draftMediaStorage.js";

function createFakeIndexedDB() {
  const stores = new Map();
  let database = null;
  let openCount = 0;

  const names = (values) => ({
    contains(value) {
      return values.has(value);
    },
  });

  const storeHandle = (definition, transaction = null) => ({
    indexNames: names(definition.indexes),
    createIndex(name) {
      definition.indexes.add(name);
      return {};
    },
    put(record) {
      return transaction.request(() => {
        definition.records.set(record.key, { ...record });
        return record.key;
      });
    },
    get(key) {
      return transaction.request(() => definition.records.get(key));
    },
    delete(key) {
      return transaction.request(() => definition.records.delete(key));
    },
    index(name) {
      if (!definition.indexes.has(name)) {
        throw new Error(`Missing index: ${name}`);
      }
      return {
        getAll(draftId) {
          return transaction.request(() =>
            [...definition.records.values()]
              .filter((record) => record.draftId === draftId)
              .map((record) => ({ ...record })),
          );
        },
      };
    },
  });

  const createTransaction = (storeName) => {
    const definition = stores.get(storeName);
    if (!definition) throw new Error(`Missing store: ${storeName}`);
    let pending = 0;
    let completeQueued = false;
    const transaction = {
      error: null,
      objectStore() {
        return storeHandle(definition, transaction);
      },
      request(operation) {
        pending += 1;
        const request = { error: null, result: undefined };
        queueMicrotask(() => {
          try {
            request.result = operation();
            request.onsuccess?.({ target: request });
          } catch (error) {
            request.error = error;
            transaction.error = error;
            request.onerror?.({ target: request });
            transaction.onerror?.({ target: transaction });
            transaction.onabort?.({ target: transaction });
          } finally {
            pending -= 1;
            if (pending === 0 && !completeQueued && !transaction.error) {
              completeQueued = true;
              queueMicrotask(() =>
                transaction.oncomplete?.({ target: transaction }),
              );
            }
          }
        });
        return request;
      },
    };
    return transaction;
  };

  return {
    get openCount() {
      return openCount;
    },
    open(_name, version) {
      openCount += 1;
      const request = { error: null, result: null, transaction: null };
      queueMicrotask(() => {
        const needsUpgrade = !database || version > database.version;
        if (!database) {
          database = {
            version,
            closed: false,
            objectStoreNames: names(stores),
            createObjectStore(storeName) {
              const definition = {
                indexes: new Set(),
                records: new Map(),
              };
              stores.set(storeName, definition);
              return storeHandle(definition);
            },
            transaction(storeName) {
              return createTransaction(storeName);
            },
            close() {
              this.closed = true;
            },
          };
        }
        database.version = Math.max(database.version, version);
        database.closed = false;
        request.result = database;
        if (needsUpgrade) {
          request.transaction = {
            objectStore(storeName) {
              return storeHandle(stores.get(storeName));
            },
          };
          request.onupgradeneeded?.({ target: request });
        }
        queueMicrotask(() => request.onsuccess?.({ target: request }));
      });
      return request;
    },
  };
}

test("draft media asset keys round-trip arbitrary stable ids", () => {
  const key = draftMediaAssetKey("draft:one/two", "fill ü/background");
  assert.deepEqual(parseDraftMediaAssetKey(key), {
    draftId: "draft:one/two",
    roleId: "fill ü/background",
  });
  assert.equal(parseDraftMediaAssetKey("blob:old-session"), null);
  assert.equal(parseDraftMediaAssetKey("local-draft-media:v1:bad"), null);
  assert.throws(() => draftMediaAssetKey("", "fill"), /draftId/);
  assert.throws(() => draftMediaAssetKey("draft:one", " "), /roleId/);
});

test("records retain file metadata without retaining object urls", async () => {
  const blob = new Blob(["pixels"], { type: "image/webp" });
  const record = createDraftMediaRecord({
    draftId: "draft:one",
    roleId: "fill-photo",
    blob,
    fileName: "photo.webp",
    lastModified: 123,
    updatedAt: 456,
  });

  assert.deepEqual(
    {
      draftId: record.draftId,
      roleId: record.roleId,
      name: record.name,
      type: record.type,
      size: record.size,
      lastModified: record.lastModified,
      updatedAt: record.updatedAt,
    },
    {
      draftId: "draft:one",
      roleId: "fill-photo",
      name: "photo.webp",
      type: "image/webp",
      size: 6,
      lastModified: 123,
      updatedAt: 456,
    },
  );
  assert.equal("url" in record, false);
  assert.equal(await record.blob.text(), "pixels");

  class FakeFile extends Blob {
    constructor(parts, name, options) {
      super(parts, options);
      this.name = name;
      this.lastModified = options.lastModified;
    }
  }
  const file = draftMediaRecordToFile(record, FakeFile);
  assert.equal(file.name, "photo.webp");
  assert.equal(file.type, "image/webp");
  assert.equal(file.lastModified, 123);
  assert.equal(await file.text(), "pixels");

  const seen = [];
  const objectUrl = createDraftMediaObjectUrl(record, {
    createObjectURL(value) {
      seen.push(value);
      return "blob:fresh";
    },
  });
  assert.equal(objectUrl, "blob:fresh");
  assert.deepEqual(seen, [blob]);
});

test("IndexedDB store persists, lists, and deletes media by draft and role", async () => {
  const indexedDB = createFakeIndexedDB();
  const store = createDraftMediaStore({
    indexedDB,
    now: () => 900,
  });
  await store.put({
    draftId: "draft:one",
    roleId: "video",
    blob: new Blob(["movie"], { type: "video/mp4" }),
    fileName: "movie.mp4",
    lastModified: 12,
  });
  await store.put({
    draftId: "draft:one",
    roleId: "image",
    blob: new Blob(["photo"], { type: "image/png" }),
    fileName: "photo.png",
  });
  await store.put({
    draftId: "draft:other",
    roleId: "image",
    blob: new Blob(["other"], { type: "image/png" }),
  });

  const movie = await store.get("draft:one", "video");
  assert.equal(movie.name, "movie.mp4");
  assert.equal(movie.type, "video/mp4");
  assert.equal(movie.lastModified, 12);
  assert.equal(movie.updatedAt, 900);
  assert.equal(await movie.blob.text(), "movie");

  const listed = await store.list("draft:one");
  assert.deepEqual(
    listed.map((record) => record.roleId),
    ["image", "video"],
  );
  assert.equal(indexedDB.openCount, 1);

  await store.delete("draft:one", "video");
  assert.equal(await store.get("draft:one", "video"), null);
  assert.equal((await store.list("draft:other")).length, 1);
});

test("a new store instance reads blobs and creates fresh urls after reload", async () => {
  const indexedDB = createFakeIndexedDB();
  const beforeReload = createDraftMediaStore({ indexedDB });
  assert.equal(beforeReload.isDurable(), true);
  await beforeReload.put({
    draftId: "draft:reload",
    roleId: "photo",
    blob: new Blob(["persisted"], { type: "image/png" }),
    fileName: "persisted.png",
  });

  const liveFill = {
    id: "photo",
    type: "image",
    paint: {
      type: "image",
      image: {
        url: "blob:previous-document",
        scaleMode: "fit",
      },
    },
  };
  const persistedFill = annotatePersistedFillMedia(liveFill, {
    draftId: "draft:reload",
    roleId: "photo",
  });
  assert.equal(persistedFill.paint.image.url, undefined);
  assert.equal(liveFill.paint.image.url, "blob:previous-document");

  const afterReload = createDraftMediaStore({ indexedDB });
  let nextUrl = 0;
  const urlApi = {
    createObjectURL() {
      nextUrl += 1;
      return `blob:current-document-${nextUrl}`;
    },
  };
  const first = await hydratePersistedFillMedia(
    persistedFill,
    afterReload,
    { urlApi },
  );
  const second = await hydratePersistedFillMedia(
    persistedFill,
    afterReload,
    { urlApi },
  );
  assert.equal(first.paint.image.url, "blob:current-document-1");
  assert.equal(second.paint.image.url, "blob:current-document-2");
  assert.equal(await (await afterReload.get("draft:reload", "photo")).blob.text(), "persisted");
  assert.equal(indexedDB.openCount, 2);
});

test("hydration recovers an interrupted annotation by draft and fill id", async () => {
  const store = createDraftMediaStore({
    adapter: {
      async get(key) {
        return key === draftMediaAssetKey("draft:recover", "photo")
          ? createDraftMediaRecord({
              draftId: "draft:recover",
              roleId: "photo",
              blob: new Blob(["recovered"], { type: "image/png" }),
            })
          : null;
      },
    },
  });
  const fill = {
    id: "photo",
    type: "image",
    paint: { type: "image", image: { scaleMode: "fit" } },
  };
  const hydrated = await hydratePersistedFillMedia(fill, store, {
    draftId: "draft:recover",
    urlApi: { createObjectURL: () => "blob:recovered" },
  });

  assert.equal(hydrated.paint.image.url, "blob:recovered");
  assert.equal(
    hydrated.paint.image.localAssetKey,
    draftMediaAssetKey("draft:recover", "photo"),
  );
});

test("store falls back to memory when IndexedDB is absent or fails to open", async () => {
  const absent = createDraftMediaStore({
    indexedDB: undefined,
    now: () => 10,
  });
  await absent.put({
    draftId: "draft:memory",
    roleId: "input",
    blob: new Blob(["memory"]),
  });
  assert.equal(absent.isDurable(), false);
  assert.equal(
    await (await absent.get("draft:memory", "input")).blob.text(),
    "memory",
  );

  const failed = createDraftMediaStore({
    indexedDB: {
      open() {
        throw new Error("disabled");
      },
    },
  });
  await failed.put({
    draftId: "draft:fallback",
    roleId: "input",
    blob: new Blob(["fallback"]),
  });
  assert.equal(failed.isDurable(), false);
  assert.equal((await failed.list("draft:fallback")).length, 1);
  assert.equal(
    await (await failed.get("draft:fallback", "input")).blob.text(),
    "fallback",
  );
});

test("persisted fill annotations preserve paint settings and strip transient urls", () => {
  const image = annotatePersistedFillMedia(
    {
      id: "photo",
      type: "image",
      values: { opacity: 0.5 },
      paint: {
        type: "image",
        image: {
          url: "data:image/png;base64,aA==",
          scaleMode: "fill",
          scale: 75,
        },
      },
    },
    { draftId: "draft:one", roleId: "photo" },
  );
  assert.equal(image.paint.image.url, undefined);
  assert.equal(image.paint.image.scaleMode, "fill");
  assert.equal(image.paint.image.scale, 75);
  assert.deepEqual(image.values, { opacity: 0.5 });
  assert.equal(
    localDraftMediaKeyFromFill(image),
    draftMediaAssetKey("draft:one", "photo"),
  );

  const video = annotatePersistedFillMedia(
    {
      id: "movie",
      type: "video",
      paint: {
        type: "video",
        video: {
          url: "blob:movie",
          poster: "blob:poster",
          scaleMode: "fit",
        },
      },
    },
    { draftId: "draft:one", roleId: "movie" },
  );
  assert.equal(video.paint.video.url, undefined);
  assert.equal(video.paint.video.poster, undefined);
  assert.equal(video.paint.video.scaleMode, "fit");

  const remote = annotatePersistedFillMedia(
    {
      id: "remote",
      type: "image",
      paint: {
        type: "image",
        image: { url: "https://cdn.example.com/photo.png" },
      },
    },
    { draftId: "draft:one", roleId: "remote" },
  );
  assert.equal(remote.paint.image.url, "https://cdn.example.com/photo.png");
});

test("fill hydration handles image/video stacks and missing records", async () => {
  const records = new Map([
    [
      "draft:stack/image",
      createDraftMediaRecord({
        draftId: "draft:stack",
        roleId: "image",
        blob: new Blob(["image"], { type: "image/png" }),
      }),
    ],
    [
      "draft:stack/video",
      createDraftMediaRecord({
        draftId: "draft:stack",
        roleId: "video",
        blob: new Blob(["video"], { type: "video/mp4" }),
      }),
    ],
  ]);
  const mediaStore = {
    async get(draftId, roleId) {
      return records.get(`${draftId}/${roleId}`) || null;
    },
  };
  const fills = [
    annotatePersistedFillMedia(
      {
        id: "image",
        type: "image",
        paint: { type: "image", image: { scaleMode: "fill" } },
      },
      { draftId: "draft:stack", roleId: "image" },
    ),
    annotatePersistedFillMedia(
      {
        id: "video",
        type: "video",
        paint: { type: "video", video: { scaleMode: "fit" } },
      },
      { draftId: "draft:stack", roleId: "video" },
    ),
  ];
  let sequence = 0;
  const hydrated = await hydratePersistedFillMediaStack(fills, mediaStore, {
    urlApi: {
      createObjectURL() {
        sequence += 1;
        return `blob:hydrated-${sequence}`;
      },
    },
  });
  assert.equal(hydrated[0].paint.image.url, "blob:hydrated-1");
  assert.equal(hydrated[1].paint.video.url, "blob:hydrated-2");
  assert.equal(hydrated[0].paint.image.scaleMode, "fill");
  assert.equal(hydrated[1].paint.video.scaleMode, "fit");

  const missing = annotatePersistedFillMedia(
    {
      id: "missing",
      type: "image",
      paint: { type: "image", image: {} },
    },
    { draftId: "draft:stack", roleId: "missing" },
  );
  assert.strictEqual(
    await hydratePersistedFillMedia(missing, mediaStore),
    missing,
  );
  assert.equal(
    unresolvedLocalDraftMediaKey(missing),
    draftMediaAssetKey("draft:stack", "missing"),
  );
  assert.equal(unresolvedLocalDraftMediaKey(hydrated[0]), null);
  assert.deepEqual(
    await hydratePersistedFillMediaStack(null, mediaStore),
    [],
  );
});
