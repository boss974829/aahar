import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Mic, Video } from "lucide-react";
import {
  ACTIVITIES,
  bmi,
  bmiBand,
  bmiLabel,
  itemMacros,
  macroTargets,
  round1,
  sumMacros,
  todayKey,
  type Entry,
  type Profile,
} from "@/lib/health";
import { readMedia } from "@/lib/vault";
import { Button, Card, PageIntro } from "./ui";

export function Today({
  userId,
  name,
  profile,
  entries,
  cryptoKey,
  onLog,
  onUpdate,
  onDelete,
}: {
  userId: string;
  name: string | null;
  profile: Profile;
  entries: Entry[];
  cryptoKey: CryptoKey;
  onLog: () => void;
  onUpdate: (entry: Entry) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const key = todayKey();
  const todays = entries.filter((entry) => entry.loggedOn === key);
  const meals = todays.filter((entry) => entry.type === "meal");
  const moves = todays.filter((entry) => entry.type === "activity");
  const eaten = meals.reduce((sum, entry) => sum + (entry.type === "meal" ? sumMacros(entry.meal.items).kcal : 0), 0);
  const protein = meals.reduce((sum, entry) => sum + (entry.type === "meal" ? sumMacros(entry.meal.items).protein : 0), 0);
  const carbs = meals.reduce((sum, entry) => sum + (entry.type === "meal" ? sumMacros(entry.meal.items).carbs : 0), 0);
  const fat = meals.reduce((sum, entry) => sum + (entry.type === "meal" ? sumMacros(entry.meal.items).fat : 0), 0);
  const moved = moves.reduce((sum, entry) => sum + (entry.type === "activity" ? entry.activity.kcal : 0), 0);
  const targets = macroTargets(profile);
  const score = bmi(profile.weightKg, profile.heightCm);
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const who = name?.split(" ")[0];
  const left = Math.round(targets.kcal - eaten);

  return (
    <div className="space-y-6">
      <PageIntro kicker={format(new Date(), "EEEE, d MMMM")} title={who ? `${hello}, ${who}` : hello} />
      <Card>
        <div className="flex items-center gap-5">
          <Ring value={eaten} max={targets.kcal} />
          <div className="min-w-0 flex-1">
            <p className="kicker">Eaten</p>
            <p className="mt-2 font-display text-5xl tabular-nums text-ink">{Math.round(eaten)}</p>
            <p className="mt-2 text-sm tabular-nums text-muted">
              of {targets.kcal.toLocaleString("en-US")} kcal · {left >= 0 ? `${left} left` : `${Math.abs(left)} over`}
            </p>
            {moved > 0 ? <p className="mt-1 text-sm text-muted">Moved about {moved} kcal</p> : null}
          </div>
        </div>
        <div className="mt-6 space-y-4 border-t border-line pt-5">
          <Macro label="Protein" value={protein} target={targets.protein} />
          <Macro label="Carbs" value={carbs} target={targets.carbs} />
          <Macro label="Fat" value={fat} target={targets.fat} />
        </div>
      </Card>
      <div className="panel flex items-center justify-between gap-4 px-5 py-4">
        <div>
          <p className="kicker">BMI</p>
          <p className="mt-1 font-display text-3xl tabular-nums">{round1(score)}</p>
        </div>
        <p className="max-w-44 text-right text-sm leading-snug text-muted">{bmiLabel(bmiBand(score), profile.lang)}</p>
      </div>
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-2xl">Today</h2>
        <Button className="h-11 px-5" onClick={onLog}>
          Add
        </Button>
      </div>
      {todays.length === 0 ? (
        <Card>
          <p className="text-base text-ink">Nothing logged yet.</p>
          <p className="mt-2 text-sm text-muted">A sentence is enough — “2 roti and dal”, in English or Hindi.</p>
          <Button className="mt-4 w-full" onClick={onLog}>
            Log a meal
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {todays.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              userId={userId}
              cryptoKey={cryptoKey}
              lang={profile.lang}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Ring({ value, max }: { value: number; max: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const over = max > 0 && value > max;
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0" aria-hidden="true">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--soft)" strokeWidth="6" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={over ? "var(--clay)" : "var(--leaf)"}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 60 60)"
      />
    </svg>
  );
}

function Macro({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted">
          {Math.round(value)} / {target} g
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft">
        <div className="h-1.5 rounded-full bg-leaf" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  userId,
  cryptoKey,
  lang,
  onUpdate,
  onDelete,
}: {
  entry: Entry;
  userId: string;
  cryptoKey: CryptoKey;
  lang: Profile["lang"];
  onUpdate: (entry: Entry) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [missingClip, setMissingClip] = useState(false);

  useEffect(() => {
    if (!open || entry.type !== "meal") return;
    let cancel = false;
    const urls: string[] = [];
    void (async () => {
      if (entry.meal.hasAudio) {
        const blob = await readMedia(userId, entry.id, "audio", cryptoKey);
        if (cancel) return;
        if (blob) {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setAudioUrl(url);
        } else setMissingClip(true);
      }
      if (entry.meal.hasVideo) {
        const blob = await readMedia(userId, entry.id, "video", cryptoKey);
        if (cancel) return;
        if (blob) {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setVideoUrl(url);
        } else setMissingClip(true);
      }
    })();
    return () => {
      cancel = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [open, entry, userId, cryptoKey]);

  if (entry.type === "activity") {
    const label = ACTIVITIES.find((a) => a.id === entry.activity.kind);
    return (
      <Card>
        <p className="font-medium">{lang === "hi" ? label?.hi : label?.label}</p>
        <p className="text-sm tabular-nums text-muted">
          {entry.activity.minutes} min · about {entry.activity.kcal} kcal
        </p>
      </Card>
    );
  }
  if (entry.type === "weight") {
    return (
      <Card>
        <p className="font-medium">Weight</p>
        <p className="text-sm tabular-nums text-muted">{round1(entry.weight.weightKg)} kg</p>
      </Card>
    );
  }

  const meal = entry.meal;
  const totals = sumMacros(meal.items);
  return (
    <Card>
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen((v) => !v)}>
        <span>
          <span className="block font-medium">{meal.title}</span>
          <span className="mt-1 flex items-center gap-2 text-sm text-muted">
            {meal.hasAudio ? <Mic size={14} aria-label="Voice clip" /> : null}
            {meal.hasVideo ? <Video size={14} aria-label="Meal video" /> : null}
            <span className="tabular-nums">{Math.round(totals.kcal)} kcal</span>
          </span>
        </span>
        <span className="text-sm text-sage">{open ? "Close" : "Edit"}</span>
      </button>
      {open ? (
        <div className="mt-4 space-y-3">
          {meal.transcript ? <p className="text-sm text-muted">{meal.transcript}</p> : null}
          {meal.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{lang === "hi" ? item.nameHi : item.name}</span>
              <label className="flex items-center gap-2 tabular-nums">
                <input
                  type="number"
                  min={5}
                  max={2000}
                  defaultValue={item.grams}
                  onBlur={(event) => {
                    const grams = Number(event.target.value);
                    if (!Number.isFinite(grams)) return;
                    const nextItems = meal.items.map((row) => (row.id === item.id ? { ...row, grams } : row));
                    void onUpdate({ ...entry, meal: { ...meal, items: nextItems } });
                  }}
                  className="field field-compact"
                />
                g
                <span className="w-14 text-right text-muted">{Math.round(itemMacros(item).kcal)}</span>
              </label>
            </div>
          ))}
          {audioUrl ? <audio controls src={audioUrl} className="w-full" /> : null}
          {videoUrl ? <video controls playsInline src={videoUrl} className="media" /> : null}
          {missingClip ? <p className="text-sm text-muted">The clip stays on the device that recorded it.</p> : null}
          {confirm ? (
            <Button variant="quiet" className="w-full text-clay" onClick={() => void onDelete(entry.id)}>
              Remove this meal
            </Button>
          ) : (
            <Button variant="ghost" className="w-full text-clay" onClick={() => setConfirm(true)}>
              Delete
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
