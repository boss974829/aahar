import { parseMealText } from "@/lib/health";

export type VaultRemote = {
  wrapCipher: string;
  wrapIv: string;
  wrapSalt: string;
  profileCipher: string | null;
  profileIv: string | null;
} | null;

export type LogRemote = {
  id: string;
  kind: "meal" | "activity" | "weight";
  loggedOn: string;
  cipher: string;
  iv: string;
  createdAt: string;
};

type Store = { vault: VaultRemote; logs: LogRemote[] };

const DB_NAME = "aahar-phone";
const STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readStore(): Promise<Store> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get("journal");
    req.onsuccess = () => resolve((req.result as Store | undefined) ?? { vault: null, logs: [] });
    req.onerror = () => reject(req.error);
  });
}

async function writeStore(store: Store): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(store, "journal");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getVault(): Promise<VaultRemote> {
  return (await readStore()).vault;
}

export async function saveWrap({
  data,
}: {
  data: {
    wrapCipher: string;
    wrapIv: string;
    wrapSalt: string;
    profileCipher: string;
    profileIv: string;
  };
}) {
  const store = await readStore();
  store.vault = {
    wrapCipher: data.wrapCipher,
    wrapIv: data.wrapIv,
    wrapSalt: data.wrapSalt,
    profileCipher: data.profileCipher,
    profileIv: data.profileIv,
  };
  await writeStore(store);
  return { ok: true };
}

export async function saveProfile({ data }: { data: { profileCipher: string; profileIv: string } }) {
  const store = await readStore();
  if (!store.vault) throw new Error("Journal isn't ready.");
  store.vault = { ...store.vault, profileCipher: data.profileCipher, profileIv: data.profileIv };
  await writeStore(store);
  return { ok: true };
}

export async function listLogs({ data }: { data: { since: string } }): Promise<LogRemote[]> {
  const store = await readStore();
  return store.logs.filter((row) => row.loggedOn >= data.since);
}

export async function upsertLog({
  data,
}: {
  data: { id: string; kind: LogRemote["kind"]; loggedOn: string; cipher: string; iv: string };
}) {
  const store = await readStore();
  const next: LogRemote = { ...data, createdAt: new Date().toISOString() };
  const index = store.logs.findIndex((row) => row.id === data.id);
  if (index >= 0) store.logs[index] = { ...store.logs[index], ...next, createdAt: store.logs[index].createdAt };
  else store.logs.push(next);
  await writeStore(store);
  return { ok: true };
}

export async function deleteLog({ data }: { data: { id: string } }) {
  const store = await readStore();
  store.logs = store.logs.filter((row) => row.id !== data.id);
  await writeStore(store);
  return { ok: true };
}

export async function estimateMeal({ data }: { data: { text: string; image?: string; lang: "en" | "hi" } }) {
  const parsed = parseMealText(data.text);
  if (!parsed.length) {
    return { ok: false as const, error: "Name the foods, like 2 roti and dal. You can also pick them from the list." };
  }
  return {
    ok: true as const,
    data: {
      note: "",
      items: parsed.map((item) => ({
        name: item.name,
        nameHi: item.nameHi,
        grams: item.grams,
        per100: item.per100,
        source: "ai" as const,
      })),
    },
  };
}

export async function transcribeClip(_input: { data: { audioBase64: string; mime: string; lang: "en" | "hi" } }) {
  return { ok: false as const, error: "On the phone, type the meal or use the on-device listener if it appears." };
}

export async function adviseDiet(_input: { data: Record<string, unknown> }) {
  return { ok: false as const, error: "The note on this screen is already written from your logs." };
}
