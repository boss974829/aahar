import { useEffect, useState } from "react";
import { ChartColumn, House, Leaf, Plus, UserRound } from "lucide-react";
import type { AppUser } from "@/lib/auth/use-current-user";
import {
  addDaysKey,
  todayKey,
  type Entry,
  type EntryPayload,
  type Profile,
} from "@/lib/health";
import {
  deleteLog,
  getVault,
  listLogs,
  saveProfile,
  saveWrap,
  upsertLog,
  type VaultRemote,
} from "@/lib/records.functions";
import {
  decryptJson,
  deleteMedia,
  encryptJson,
  generateDataKey,
  loadLocalKey,
  saveMedia,
  storeLocalKey,
  unwrapKey,
  wrapKey,
} from "@/lib/vault";
import { History } from "./history";
import { Logger } from "./logger";
import { Onboarding, Unlock } from "./onboarding";
import { Plan } from "./plan";
import { Settings } from "./settings";
import { Today } from "./today";
import { Banner, ThemeToggle } from "./ui";

type Tab = "today" | "log" | "month" | "plan";

function greetingName(user: AppUser): string | null {
  const email = user.primaryEmail?.trim();
  if (email && !email.toLowerCase().endsWith("@viewer.grok.invalid")) {
    const handle = email.split("@")[0]?.trim();
    if (handle) return handle.charAt(0).toUpperCase() + handle.slice(1);
  }
  const first = user.displayName?.trim().split(/\s+/)[0];
  if (first && !/^grok$/i.test(first)) return first;
  return null;
}

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Profile;
  return typeof profile.heightCm === "number" && typeof profile.weightKg === "number" && typeof profile.goal === "string";
}

function isPayload(value: unknown): value is EntryPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as EntryPayload;
  return payload.type === "meal" || payload.type === "activity" || payload.type === "weight";
}

export function AaharApp({ user }: { user: AppUser }) {
  const [phase, setPhase] = useState<"boot" | "onboard" | "unlock" | "ready">("boot");
  const [needsPassphrase, setNeedsPassphrase] = useState(true);
  const [remote, setRemote] = useState<VaultRemote>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [locked, setLocked] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const vault = await getVault();
        const local = await loadLocalKey(user.id);
        if (cancel) return;
        setRemote(vault);
        if (local) {
          setKey(local);
          if (vault?.profileCipher && vault.profileIv) {
            try {
              const decoded = await decryptJson<unknown>(local, vault.profileCipher, vault.profileIv);
              if (!isProfile(decoded)) throw new Error("profile");
              if (cancel) return;
              setProfile(decoded);
              await hydrate(local, (rows, missed) => {
                if (cancel) return;
                setEntries(rows);
                setLocked(missed);
              });
              setPhase("ready");
              return;
            } catch {
              setPhase("unlock");
              return;
            }
          }
          setNeedsPassphrase(!vault);
          setPhase("onboard");
          return;
        }
        if (vault) {
          setPhase("unlock");
          return;
        }
        setNeedsPassphrase(true);
        setPhase("onboard");
      } catch (err) {
        if (!cancel) {
          setError(err instanceof Error ? err.message : "Couldn't open the journal.");
          setPhase("boot");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user.id]);

  async function hydrate(dataKey: CryptoKey, apply: (rows: Entry[], missed: number) => void) {
    const rows = await listLogs({ data: { since: addDaysKey(todayKey(), -30) } });
    const next: Entry[] = [];
    let missed = 0;
    for (const row of rows) {
      try {
        const payload = await decryptJson<unknown>(dataKey, row.cipher, row.iv);
        if (!isPayload(payload)) {
          missed += 1;
          continue;
        }
        next.push({ id: row.id, loggedOn: row.loggedOn, createdAt: row.createdAt, ...payload });
      } catch {
        missed += 1;
      }
    }
    apply(next, missed);
  }

  async function finish(next: Profile, passphrase: string | null) {
    let dataKey = key;
    if (!remote) {
      if (!passphrase) throw new Error("Choose a passphrase first.");
      dataKey = dataKey ?? (await generateDataKey());
      const wrapped = await wrapKey(dataKey, passphrase);
      const enc = await encryptJson(dataKey, next);
      await saveWrap({
        data: {
          wrapCipher: wrapped.cipher,
          wrapIv: wrapped.iv,
          wrapSalt: wrapped.salt,
          profileCipher: enc.cipher,
          profileIv: enc.iv,
        },
      });
      await storeLocalKey(user.id, dataKey);
      setRemote({
        wrapCipher: wrapped.cipher,
        wrapIv: wrapped.iv,
        wrapSalt: wrapped.salt,
        profileCipher: enc.cipher,
        profileIv: enc.iv,
      });
    } else if (dataKey) {
      const enc = await encryptJson(dataKey, next);
      await saveProfile({ data: { profileCipher: enc.cipher, profileIv: enc.iv } });
    } else {
      throw new Error("Unlock the journal before saving.");
    }
    setKey(dataKey);
    setProfile(next);
    setPhase("ready");
  }

  async function unlock(passphrase: string) {
    if (!remote) throw new Error("Nothing is stored for this account yet.");
    try {
      const dataKey = await unwrapKey(passphrase, {
        cipher: remote.wrapCipher,
        iv: remote.wrapIv,
        salt: remote.wrapSalt,
      });
      await storeLocalKey(user.id, dataKey);
      setKey(dataKey);
      if (remote.profileCipher && remote.profileIv) {
        const decoded = await decryptJson<unknown>(dataKey, remote.profileCipher, remote.profileIv);
        if (!isProfile(decoded)) throw new Error("That passphrase didn't match this journal.");
        setProfile(decoded);
        await hydrate(dataKey, (rows, missed) => {
          setEntries(rows);
          setLocked(missed);
        });
        setPhase("ready");
        return;
      }
      setNeedsPassphrase(false);
      setPhase("onboard");
    } catch (err) {
      if (err instanceof Error && err.message.includes("journal")) throw err;
      throw new Error("That passphrase didn't open your journal.");
    }
  }

  async function persistProfile(next: Profile) {
    if (!key) throw new Error("Unlock the journal first.");
    const enc = await encryptJson(key, next);
    await saveProfile({ data: { profileCipher: enc.cipher, profileIv: enc.iv } });
    setProfile(next);
  }

  async function addEntry(payload: EntryPayload, media?: { audio?: Blob; video?: Blob }) {
    if (!key || !profile) throw new Error("Journal isn't ready.");
    const id = crypto.randomUUID();
    const loggedOn = todayKey();
    const enc = await encryptJson(key, payload);
    await upsertLog({ data: { id, kind: payload.type, loggedOn, cipher: enc.cipher, iv: enc.iv } });
    try {
      if (media?.audio) await saveMedia(user.id, id, "audio", media.audio, key);
      if (media?.video) await saveMedia(user.id, id, "video", media.video, key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The meal was saved, but the clip was not.");
    }
    setEntries((prev) => [...prev, { id, loggedOn, createdAt: new Date().toISOString(), ...payload }]);
    if (payload.type === "weight") {
      await persistProfile({ ...profile, weightKg: payload.weight.weightKg });
    }
    setTab("today");
    setSettings(false);
  }

  async function updateEntry(next: Entry) {
    if (!key) return;
    const payload: EntryPayload =
      next.type === "meal"
        ? { type: "meal", meal: next.meal }
        : next.type === "activity"
          ? { type: "activity", activity: next.activity }
          : { type: "weight", weight: next.weight };
    const enc = await encryptJson(key, payload);
    await upsertLog({ data: { id: next.id, kind: next.type, loggedOn: next.loggedOn, cipher: enc.cipher, iv: enc.iv } });
    setEntries((prev) => prev.map((entry) => (entry.id === next.id ? next : entry)));
  }

  async function removeEntry(id: string) {
    await deleteLog({ data: { id } });
    await deleteMedia(user.id, id);
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }

  if (phase === "boot") {
    return (
      <main className="safe-top mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-8">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <div>
          <p className="kicker">Private journal</p>
          <p className="mt-3 font-display text-6xl italic text-ink">Aahar</p>
          <p className="mt-4 max-w-xs text-base text-muted">{error ?? "Opening your private journal."}</p>
        </div>
        <p className="text-sm text-muted">Encrypted on this device.</p>
      </main>
    );
  }
  if (phase === "unlock") return <Unlock onUnlock={unlock} />;
  if (phase === "onboard" || !profile || !key) {
    return <Onboarding needsPassphrase={needsPassphrase} onComplete={finish} />;
  }

  const tabs: { id: Tab; label: string; icon: typeof House }[] = [
    { id: "today", label: "Today", icon: House },
    { id: "log", label: "Log", icon: Plus },
    { id: "month", label: "Month", icon: ChartColumn },
    { id: "plan", label: "Plan", icon: Leaf },
  ];

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md text-ink">
      <header className="safe-top sticky top-0 z-20 flex items-end justify-between border-b border-line bg-canvas px-6 pb-4">
        <div>
          <p className="kicker">Private journal</p>
          <p className="mt-1 font-display text-3xl italic leading-none">Aahar</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button type="button" aria-label="Your account" onClick={() => setSettings(true)} className="icon-btn press">
            <UserRound size={18} strokeWidth={1.75} />
          </button>
        </div>
      </header>
      <main className="px-6 pt-2 pb-36">
        {error ? (
          <div className="mb-4">
            <Banner>{error}</Banner>
          </div>
        ) : null}
        {locked > 0 ? (
          <div className="mb-4">
            <Banner>
              {locked} older record{locked === 1 ? "" : "s"} couldn't be opened on this device.
            </Banner>
          </div>
        ) : null}
        <div key={settings ? "settings" : tab} className="rise">
          {settings ? (
            <Settings user={user} profile={profile} onProfile={persistProfile} onClose={() => setSettings(false)} />
          ) : tab === "today" ? (
            <Today
              userId={user.id}
              name={greetingName(user)}
              profile={profile}
              entries={entries}
              cryptoKey={key}
              onLog={() => setTab("log")}
              onUpdate={updateEntry}
              onDelete={removeEntry}
            />
          ) : tab === "log" ? (
            <Logger profile={profile} onSave={addEntry} />
          ) : tab === "month" ? (
            <History entries={entries} />
          ) : (
            <Plan profile={profile} entries={entries} onProfile={persistProfile} />
          )}
        </div>
      </main>
      <nav className="nav-pad dock-wrap fixed inset-x-0 bottom-0 z-20">
        <div className="mx-auto w-full max-w-md px-5 pt-8 pb-3">
          <div className="dock grid grid-cols-4">
            {tabs.map((item) => {
              const Icon = item.icon;
              const on = !settings && tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={on ? "page" : undefined}
                  onClick={() => {
                    setSettings(false);
                    setTab(item.id);
                  }}
                  className="dock-item press"
                >
                  <Icon size={18} strokeWidth={1.75} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
