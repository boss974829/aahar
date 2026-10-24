import { useState } from "react";
import type { ActivityLevel, Goal, Lang, Profile, Sex } from "@/lib/health";
import { bmi, bmiBand, bmiLabel, calorieTarget, proteinTarget, round1 } from "@/lib/health";
import { Banner, Button, ThemeToggle } from "./ui";

type Draft = {
  unit: "metric" | "imperial";
  heightCm: string;
  feet: string;
  inches: string;
  weight: string;
  age: string;
  sex: Sex;
  goal: Goal;
  activity: ActivityLevel;
  lang: Lang;
  passphrase: string;
  confirm: string;
};

const empty: Draft = {
  unit: "metric",
  heightCm: "",
  feet: "",
  inches: "",
  weight: "",
  age: "",
  sex: "unspecified",
  goal: "maintain",
  activity: "light",
  lang: "en",
  passphrase: "",
  confirm: "",
};

function num(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function Onboarding({
  needsPassphrase,
  onComplete,
}: {
  needsPassphrase: boolean;
  onComplete: (profile: Profile, passphrase: string | null) => Promise<void>;
}) {
  const steps = needsPassphrase
    ? (["hello", "body", "goal", "life", "lock", "ready"] as const)
    : (["hello", "body", "goal", "life", "ready"] as const);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const id = steps[step] ?? "hello";

  function metrics(): { heightCm: number; weightKg: number } | null {
    const heightCm =
      draft.unit === "metric"
        ? num(draft.heightCm)
        : (() => {
            const ft = num(draft.feet);
            const inches = num(draft.inches) ?? 0;
            if (ft == null) return null;
            return Math.round((ft * 12 + inches) * 2.54 * 10) / 10;
          })();
    const weightRaw = num(draft.weight);
    const weightKg = weightRaw == null ? null : draft.unit === "metric" ? weightRaw : Math.round(weightRaw * 0.453592 * 10) / 10;
    if (heightCm == null || weightKg == null) return null;
    if (heightCm < 120 || heightCm > 230) return null;
    if (weightKg < 30 || weightKg > 250) return null;
    return { heightCm, weightKg };
  }

  function next() {
    setError(null);
    if (id === "body") {
      const body = metrics();
      if (!body) {
        setError("Check height and weight. Height 120–230 cm, weight 30–250 kg.");
        return;
      }
    }
    if (id === "life" && draft.age.trim()) {
      const age = num(draft.age);
      if (age == null || age < 13 || age > 100) {
        setError("Age should be 13 or older. You can also leave it blank.");
        return;
      }
    }
    if (id === "lock") {
      if (draft.passphrase.length < 8) {
        setError("Use at least 8 characters. This never leaves your device.");
        return;
      }
      if (draft.passphrase !== draft.confirm) {
        setError("Those two don't match yet.");
        return;
      }
    }
    setStep((n) => Math.min(steps.length - 1, n + 1));
  }

  async function finish() {
    const body = metrics();
    if (!body) return;
    const age = draft.age.trim() ? num(draft.age) : null;
    const profile: Profile = {
      heightCm: body.heightCm,
      weightKg: body.weightKg,
      age,
      sex: draft.sex,
      goal: draft.goal,
      activity: draft.activity,
      lang: draft.lang,
      advice: null,
    };
    setSaving(true);
    setError(null);
    try {
      await onComplete(profile, needsPassphrase ? draft.passphrase : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't lock the journal.");
      setSaving(false);
    }
  }

  const body = metrics();
  const preview =
    body &&
    ({
      heightCm: body.heightCm,
      weightKg: body.weightKg,
      age: num(draft.age),
      sex: draft.sex,
      goal: draft.goal,
      activity: draft.activity,
      lang: draft.lang,
      advice: null,
    } satisfies Profile);

  return (
    <main className="safe-top mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-6">
      <div className="flex items-center justify-between">
        <p className="kicker">
          {step + 1} / {steps.length}
        </p>
        <ThemeToggle />
      </div>
      <div className="mt-5 flex gap-1.5" aria-hidden="true">
        {steps.map((key, index) => (
          <span key={key} className={`h-1 flex-1 rounded-full ${index <= step ? "bg-leaf" : "bg-soft"}`} />
        ))}
      </div>
      <div className="mt-8 flex-1">
        {id === "hello" ? (
          <div className="space-y-4">
            <h1 className="text-4xl text-ink">Start with how you are today.</h1>
            <p className="text-base text-muted">
              Height and weight give a BMI and a calm daily guide. Voice works in English and Hindi. Meal clips stay on this device.
            </p>
          </div>
        ) : null}
        {id === "body" ? (
          <div className="space-y-4">
            <h1 className="text-4xl text-ink">Height and weight</h1>
            <div className="flex gap-2">
              {(["metric", "imperial"] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  aria-pressed={draft.unit === unit}
                  onClick={() => setDraft({ ...draft, unit })}
                  className="select press h-12 flex-1 text-sm font-semibold"
                >
                  {unit === "metric" ? "cm / kg" : "ft / lb"}
                </button>
              ))}
            </div>
            {draft.unit === "metric" ? (
              <Field label="Height (cm)" value={draft.heightCm} onChange={(heightCm) => setDraft({ ...draft, heightCm })} />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Feet" value={draft.feet} onChange={(feet) => setDraft({ ...draft, feet })} />
                <Field label="Inches" value={draft.inches} onChange={(inches) => setDraft({ ...draft, inches })} />
              </div>
            )}
            <Field
              label={draft.unit === "metric" ? "Weight (kg)" : "Weight (lb)"}
              value={draft.weight}
              onChange={(weight) => setDraft({ ...draft, weight })}
            />
          </div>
        ) : null}
        {id === "goal" ? (
          <Choice
            title="What do you want from the next month?"
            value={draft.goal}
            onChange={(goal) => setDraft({ ...draft, goal })}
            options={[
              ["lose", "Lose a little"],
              ["maintain", "Stay around here"],
              ["gain", "Gain some weight"],
            ]}
          />
        ) : null}
        {id === "life" ? (
          <div className="space-y-5">
            <h1 className="text-4xl text-ink">A bit more, if you want</h1>
            <Choice
              title="Most days you are"
              value={draft.activity}
              onChange={(activity) => setDraft({ ...draft, activity })}
              options={[
                ["sedentary", "Mostly sitting"],
                ["light", "On your feet some"],
                ["moderate", "Moving on purpose"],
                ["active", "Training hard"],
              ]}
            />
            <Field label="Age (optional)" value={draft.age} onChange={(age) => setDraft({ ...draft, age })} />
            <Choice
              title="Used for the calorie estimate"
              value={draft.sex}
              onChange={(sex) => setDraft({ ...draft, sex })}
              options={[
                ["female", "Female"],
                ["male", "Male"],
                ["unspecified", "Rather not say"],
              ]}
            />
            <Choice
              title="Notes and voice default"
              value={draft.lang}
              onChange={(lang) => setDraft({ ...draft, lang })}
              options={[
                ["en", "English"],
                ["hi", "हिन्दी"],
              ]}
            />
          </div>
        ) : null}
        {id === "lock" ? (
          <div className="space-y-4">
            <h1 className="text-4xl text-ink">Lock your journal</h1>
            <p className="text-base text-muted">
              This passphrase wraps the key that encrypts your meals. Aahar never receives it. On a new device you'll need it again.
            </p>
            <label className="block text-sm font-medium">
              Passphrase
              <input
                type="password"
                value={draft.passphrase}
                onChange={(event) => setDraft({ ...draft, passphrase: event.target.value })}
                autoComplete="new-password"
                className="field"
              />
            </label>
            <label className="block text-sm font-medium">
              Repeat it
              <input
                type="password"
                value={draft.confirm}
                onChange={(event) => setDraft({ ...draft, confirm: event.target.value })}
                autoComplete="new-password"
                className="field"
              />
            </label>
          </div>
        ) : null}
        {id === "ready" && preview ? (
          <div className="space-y-4">
            <p className="kicker">Your BMI</p>
            <p className="mt-3 font-display text-7xl tabular-nums text-ink">{round1(bmi(preview.weightKg, preview.heightCm))}</p>
            <p className="text-lg text-ink">{bmiLabel(bmiBand(bmi(preview.weightKg, preview.heightCm)), preview.lang)}</p>
            <p className="text-base text-muted">
              A steady day is about {calorieTarget(preview).toLocaleString("en-US")} kcal, with around {proteinTarget(preview)} g of protein.
              BMI is a rough screening number, not a diagnosis.
            </p>
          </div>
        ) : null}
        {error ? (
          <div className="mt-4">
            <Banner>{error}</Banner>
          </div>
        ) : null}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button variant="quiet" disabled={step === 0 || saving} onClick={() => setStep((n) => Math.max(0, n - 1))}>
          Back
        </Button>
        {id === "ready" ? (
          <Button onClick={finish} disabled={saving || !preview}>
            {saving ? "Locking…" : "Enter"}
          </Button>
        ) : (
          <Button onClick={next}>{id === "hello" ? "Begin" : "Next"}</Button>
        )}
      </div>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field field-hero"
      />
    </label>
  );
}

function Choice<T extends string>({
  title,
  value,
  onChange,
  options,
}: {
  title: string;
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="space-y-3">
      <h1 className="text-3xl text-ink">{title}</h1>
      <div className="space-y-2">
        {options.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            className="select press h-14 w-full px-4 text-left text-base font-semibold"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Unlock({ onUnlock }: { onUnlock: (passphrase: string) => Promise<void> }) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <main className="safe-top mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-8">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      <p className="kicker mt-10">Welcome back</p>
      <h1 className="mt-3 text-5xl italic text-ink">Open your journal</h1>
      <p className="mt-3 text-base text-muted">
        This device doesn't have the key yet. Your passphrase stays here — it is never sent with your meals.
      </p>
      <label className="mt-8 block text-sm font-medium">
        Passphrase
        <input
          type="password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          autoComplete="current-password"
          className="field"
        />
      </label>
      {error ? (
        <div className="mt-4">
          <Banner>{error}</Banner>
        </div>
      ) : null}
      <Button
        className="mt-6"
        disabled={pending || passphrase.length < 8}
        onClick={() => {
          setPending(true);
          setError(null);
          onUnlock(passphrase).catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "That didn't open it.");
            setPending(false);
          });
        }}
      >
        {pending ? "Unlocking…" : "Unlock"}
      </Button>
    </main>
  );
}
