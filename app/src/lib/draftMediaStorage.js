export const DRAFT_MEDIA_DB_NAME = "figma-shader-studio:draft-media";
export const DRAFT_MEDIA_DB_VERSION = 1;
export const DRAFT_MEDIA_STORE_NAME = "media";
export const LOCAL_DRAFT_MEDIA_KEY_PREFIX = "local-draft-media:v1:";

const DRAFT_ID_INDEX = "draftId";

function requiredId(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function isBlobLike(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.arrayBuffer === "function" &&
    Number.isFinite(value.size)
  );
}

function finiteTimestamp(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function draftMediaAssetKey(draftId, roleId) {
  return `${LOCAL_DRAFT_MEDIA_KEY_PREFIX}${encodeURIComponent(
    requiredId(draftId, "draftId"),
  )}/${encodeURIComponent(requiredId(roleId, "roleId"))}`;
}

export function parseDraftMediaAssetKey(assetKey) {
  if (
    typeof assetKey !== "string" ||
    !assetKey.startsWith(LOCAL_DRAFT_MEDIA_KEY_PREFIX)
  ) {
    return null;
  }
  const encoded = assetKey.slice(LOCAL_DRAFT_MEDIA_KEY_PREFIX.length);
  const separator = encoded.indexOf("/");
  if (separator <= 0 || separator === encoded.length - 1) return null;
  if (encoded.indexOf("/", separator + 1) !== -1) return null;
  try {
    const draftId = decodeURIComponent(encoded.slice(0, separator));
    const roleId = decodeURIComponent(encoded.slice(separator + 1));
    if (!draftId.trim() || !roleId.trim()) return null;
    return { draftId, roleId };
  } catch {
    return null;
  }
}

export function createDraftMediaRecord({
  draftId,
  roleId,
  blob,
  fileName,
  lastModified,
  updatedAt = Date.now(),
}) {
  if (!isBlobLike(blob)) {
    throw new TypeError("blob must be a Blob or File");
  }
  const key = draftMediaAssetKey(draftId, roleId);
  const name =
    (typeof fileName === "string" && fileName) ||
    (typeof blob.name === "string" && blob.name) ||
    "media";
  const type =
    (typeof blob.type === "string" && blob.type) ||
    "application/octet-stream";
  return {
    key,
    draftId,
    roleId,
    blob,
    name,
    type,
    size: blob.size,
    lastModified: finiteTimestamp(
      lastModified,
      finiteTimestamp(blob.lastModified),
    ),
    updatedAt: finiteTimestamp(updatedAt),
  };
}

function normalizeStoredRecord(record) {
  if (!record || typeof record !== "object" || !isBlobLike(record.blob)) {
    return null;
  }
  let expectedKey;
  try {
    expectedKey = draftMediaAssetKey(record.draftId, record.roleId);
  } catch {
    return null;
  }
  if (record.key !== expectedKey) return null;
  return {
    key: expectedKey,
    draftId: record.draftId,
    roleId: record.roleId,
    blob: record.blob,
    name:
      typeof record.name === "string" && record.name ? record.name : "media",
    type:
      (typeof record.type === "string" && record.type) ||
      record.blob.type ||
      "application/octet-stream",
    size: record.blob.size,
    lastModified: finiteTimestamp(record.lastModified),
    updatedAt: finiteTimestamp(record.updatedAt),
  };
}

export function draftMediaRecordToFile(
  record,
  FileConstructor = globalThis.File,
) {
  const normalized = normalizeStoredRecord(record);
  if (!normalized || typeof FileConstructor !== "function") return null;
  return new FileConstructor([normalized.blob], normalized.name, {
    type: normalized.type,
    lastModified: normalized.lastModified,
  });
}

export function createDraftMediaObjectUrl(record, urlApi = globalThis.URL) {
  const normalized = normalizeStoredRecord(record);
  if (!normalized || typeof urlApi?.createObjectURL !== "function") return null;
  return urlApi.createObjectURL(normalized.blob);
}

export function createMemoryDraftMediaAdapter(initialRecords = []) {
  const records = new Map();
  for (const candidate of initialRecords) {
    const record = normalizeStoredRecord(candidate);
    if (record) records.set(record.key, record);
  }
  return {
    async put(record) {
      records.set(record.key, record);
    },
    async get(key) {
      return records.get(key) || null;
    },
    async delete(key) {
      records.delete(key);
    },
    async list(draftId) {
      return [...records.values()].filter(
        (record) => record.draftId === draftId,
      );
    },
    close() {},
  };
}

function openDraftMediaDatabase({
  indexedDB,
  dbName,
  version,
  storeName,
}) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(dbName, version);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      const hasStore = database.objectStoreNames.contains(storeName);
      const store = hasStore
        ? request.transaction.objectStore(storeName)
        : database.createObjectStore(storeName, { keyPath: "key" });
      if (!store.indexNames.contains(DRAFT_ID_INDEX)) {
        store.createIndex(DRAFT_ID_INDEX, "draftId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Failed to open draft media storage"));
    request.onblocked = () =>
      reject(new Error("Draft media storage upgrade was blocked"));
  });
}

function runIdbRequest(database, storeName, mode, createRequest) {
  return new Promise((resolve, reject) => {
    let transaction;
    let request;
    let result;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(
        error instanceof Error
          ? error
          : transaction?.error ||
              request?.error ||
              new Error("Draft media storage operation failed"),
      );
    };
    try {
      transaction = database.transaction(storeName, mode);
      request = createRequest(transaction.objectStore(storeName));
    } catch (error) {
      fail(error);
      return;
    }
    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => fail(request.error);
    transaction.onabort = () => fail(transaction.error);
    transaction.onerror = () => fail(transaction.error);
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
  });
}

export function createIndexedDbDraftMediaAdapter({
  indexedDB = globalThis.indexedDB,
  dbName = DRAFT_MEDIA_DB_NAME,
  version = DRAFT_MEDIA_DB_VERSION,
  storeName = DRAFT_MEDIA_STORE_NAME,
} = {}) {
  if (!indexedDB || typeof indexedDB.open !== "function") {
    throw new TypeError("IndexedDB is unavailable");
  }
  let databasePromise = null;
  const database = () => {
    if (!databasePromise) {
      databasePromise = openDraftMediaDatabase({
        indexedDB,
        dbName,
        version,
        storeName,
      });
    }
    return databasePromise;
  };

  return {
    async put(record) {
      const db = await database();
      await runIdbRequest(db, storeName, "readwrite", (store) =>
        store.put(record),
      );
    },
    async get(key) {
      const db = await database();
      return (
        (await runIdbRequest(db, storeName, "readonly", (store) =>
          store.get(key),
        )) || null
      );
    },
    async delete(key) {
      const db = await database();
      await runIdbRequest(db, storeName, "readwrite", (store) =>
        store.delete(key),
      );
    },
    async list(draftId) {
      const db = await database();
      const records = await runIdbRequest(
        db,
        storeName,
        "readonly",
        (store) => store.index(DRAFT_ID_INDEX).getAll(draftId),
      );
      return Array.isArray(records) ? records : [];
    },
    async close() {
      const db = await databasePromise?.catch(() => null);
      db?.close();
      databasePromise = null;
    },
  };
}

export function createDraftMediaStore({
  adapter = null,
  indexedDB = globalThis.indexedDB,
  fallbackAdapter = createMemoryDraftMediaAdapter(),
  now = () => Date.now(),
  dbName = DRAFT_MEDIA_DB_NAME,
  version = DRAFT_MEDIA_DB_VERSION,
  storeName = DRAFT_MEDIA_STORE_NAME,
} = {}) {
  const primaryAdapter =
    adapter ||
    (indexedDB && typeof indexedDB.open === "function"
      ? createIndexedDbDraftMediaAdapter({
          indexedDB,
          dbName,
          version,
          storeName,
        })
      : null);
  let activeAdapter = primaryAdapter || fallbackAdapter;

  const run = async (method, ...args) => {
    try {
      if (typeof activeAdapter?.[method] !== "function") {
        throw new TypeError(`Draft media adapter does not implement ${method}`);
      }
      return await activeAdapter[method](...args);
    } catch (error) {
      if (activeAdapter === fallbackAdapter) throw error;
      activeAdapter = fallbackAdapter;
      return activeAdapter[method](...args);
    }
  };

  return {
    isDurable() {
      return Boolean(primaryAdapter && activeAdapter === primaryAdapter);
    },
    async put(input) {
      const record = createDraftMediaRecord({
        ...input,
        updatedAt: input?.updatedAt ?? now(),
      });
      await run("put", record);
      return record;
    },
    async get(draftId, roleId) {
      const record = await run("get", draftMediaAssetKey(draftId, roleId));
      return normalizeStoredRecord(record);
    },
    async delete(draftId, roleId) {
      await run("delete", draftMediaAssetKey(draftId, roleId));
    },
    async list(draftId) {
      requiredId(draftId, "draftId");
      const candidates = await run("list", draftId);
      return (Array.isArray(candidates) ? candidates : [])
        .map(normalizeStoredRecord)
        .filter((record) => record?.draftId === draftId)
        .sort((left, right) => left.roleId.localeCompare(right.roleId));
    },
    async close() {
      const adapters = new Set([primaryAdapter, fallbackAdapter]);
      await Promise.all(
        [...adapters]
          .filter((candidate) => typeof candidate?.close === "function")
          .map((candidate) => candidate.close()),
      );
    },
  };
}

function fillMediaSlot(fill) {
  const paint = fill?.paint;
  if (!paint || typeof paint !== "object" || Array.isArray(paint)) return null;
  if (paint.type === "image") return "image";
  if (paint.type === "video") return "video";
  return null;
}

export function isTransientDraftMediaUrl(url) {
  return (
    typeof url === "string" &&
    (url.startsWith("blob:") || url.startsWith("data:"))
  );
}

export function localDraftMediaKeyFromFill(fill) {
  const slot = fillMediaSlot(fill);
  const key = slot ? fill.paint?.[slot]?.localAssetKey : null;
  return parseDraftMediaAssetKey(key) ? key : null;
}

export function unresolvedLocalDraftMediaKey(fill) {
  const slot = fillMediaSlot(fill);
  const localAssetKey = localDraftMediaKeyFromFill(fill);
  if (!slot || !localAssetKey) return null;
  const media = fill.paint?.[slot] || {};
  return !media.assetPath &&
    (typeof media.url !== "string" || !media.url.trim())
    ? localAssetKey
    : null;
}

export function annotatePersistedFillMedia(
  fill,
  { draftId, roleId = fill?.id || "fill" } = {},
) {
  const slot = fillMediaSlot(fill);
  if (!slot) return fill;
  const localAssetKey = draftMediaAssetKey(draftId, roleId);
  const media = {
    ...(fill.paint[slot] && typeof fill.paint[slot] === "object"
      ? fill.paint[slot]
      : {}),
    localAssetKey,
  };
  if (isTransientDraftMediaUrl(media.url)) delete media.url;
  if (slot === "video" && isTransientDraftMediaUrl(media.poster)) {
    delete media.poster;
  }
  return {
    ...fill,
    paint: {
      ...fill.paint,
      [slot]: media,
    },
  };
}

export async function hydratePersistedFillMedia(
  fill,
  mediaStore,
  { urlApi = globalThis.URL, draftId = null } = {},
) {
  const slot = fillMediaSlot(fill);
  const localAssetKey = localDraftMediaKeyFromFill(fill);
  const identity =
    parseDraftMediaAssetKey(localAssetKey) ||
    (slot && typeof draftId === "string" && draftId && fill?.id
      ? { draftId, roleId: fill.id }
      : null);
  if (!slot || !identity || typeof mediaStore?.get !== "function") return fill;
  try {
    const record = await mediaStore.get(identity.draftId, identity.roleId);
    const url = createDraftMediaObjectUrl(record, urlApi);
    if (!url) return fill;
    const annotated = localAssetKey
      ? fill
      : annotatePersistedFillMedia(fill, identity);
    return {
      ...annotated,
      paint: {
        ...annotated.paint,
        [slot]: {
          ...(annotated.paint[slot] || {}),
          url,
        },
      },
    };
  } catch {
    return fill;
  }
}

export async function hydratePersistedFillMediaStack(
  fills,
  mediaStore,
  options = {},
) {
  if (!Array.isArray(fills)) return [];
  return Promise.all(
    fills.map((fill) =>
      hydratePersistedFillMedia(fill, mediaStore, options),
    ),
  );
}
