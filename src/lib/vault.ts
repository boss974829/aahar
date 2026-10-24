const DB_NAME = "aahar-vault";
const STORE = "kv";

const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }
  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return memory.get(key) as T | undefined;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => resolve(memory.get(key) as T | undefined);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbDel(key: string): Promise<void> {
  memory.delete(key);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    bin += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(bin);
}

function b64ToBuf(value: string): ArrayBuffer {
  const bin = atob(value);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function viewBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function deriveWrap(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: viewBuffer(salt), iterations: 120_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrapKey(
  key: CryptoKey,
  passphrase: string,
): Promise<{ cipher: string; iv: string; salt: string }> {
  const raw = await crypto.subtle.exportKey("raw", key);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapping = await deriveWrap(passphrase, salt);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: viewBuffer(iv) }, wrapping, raw);
  return { cipher: bufToB64(cipher), iv: bufToB64(viewBuffer(iv)), salt: bufToB64(viewBuffer(salt)) };
}

export async function unwrapKey(
  passphrase: string,
  wrap: { cipher: string; iv: string; salt: string },
): Promise<CryptoKey> {
  const salt = new Uint8Array(b64ToBuf(wrap.salt));
  const wrapping = await deriveWrap(passphrase, salt);
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(wrap.iv) }, wrapping, b64ToBuf(wrap.cipher));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<{ cipher: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: viewBuffer(iv) }, key, data);
  return { cipher: bufToB64(cipher), iv: bufToB64(viewBuffer(iv)) };
}

export async function decryptJson<T>(key: CryptoKey, cipher: string, iv: string): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(iv) }, key, b64ToBuf(cipher));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

function keyId(userId: string) {
  return `k:${userId}`;
}

export async function storeLocalKey(userId: string, key: CryptoKey): Promise<void> {
  await idbSet(keyId(userId), key);
}

export async function loadLocalKey(userId: string): Promise<CryptoKey | null> {
  const key = await idbGet<CryptoKey>(keyId(userId));
  return key ?? null;
}

type MediaRecord = { cipher: ArrayBuffer; iv: ArrayBuffer; mime: string };

function mediaId(userId: string, entryId: string, kind: "audio" | "video") {
  return `m:${userId}:${entryId}:${kind}`;
}

export async function saveMedia(
  userId: string,
  entryId: string,
  kind: "audio" | "video",
  blob: Blob,
  key: CryptoKey,
): Promise<void> {
  if (blob.size > 12_000_000) throw new Error("That clip is too large to keep.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: viewBuffer(iv) }, key, await blob.arrayBuffer());
  const record: MediaRecord = {
    cipher,
    iv: viewBuffer(iv),
    mime: blob.type || (kind === "video" ? "video/webm" : "audio/webm"),
  };
  await idbSet(mediaId(userId, entryId, kind), record);
}

export async function readMedia(
  userId: string,
  entryId: string,
  kind: "audio" | "video",
  key: CryptoKey,
): Promise<Blob | null> {
  const record = await idbGet<MediaRecord>(mediaId(userId, entryId, kind));
  if (!record?.cipher || !record.iv) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv }, key, record.cipher);
    return new Blob([plain], { type: record.mime });
  } catch {
    return null;
  }
}

export async function deleteMedia(userId: string, entryId: string): Promise<void> {
  await idbDel(mediaId(userId, entryId, "audio"));
  await idbDel(mediaId(userId, entryId, "video"));
}
