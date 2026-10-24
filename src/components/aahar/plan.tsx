import { useState } from "react";
import {
  addDaysKey,
  bmi,
  bmiBand,
  bmiLabel,
  calorieTarget,
  coach,
  proteinTarget,
  round1,
  sumMacros,
  todayKey,
  type Entry,
  type Profile,
} from "@/lib/health";
import { adviseDiet } from "@/lib/records.functions";
import { Banner, Button, Card, PageIntro } from "./ui";

export function Plan({
  profile,
  entries,
  onProfile,
}: {
  profile: Profile;
  entries: Entry[];
  onProfile: (profile: Profile) => Promise<void>;
}) {
  const note = coach(profile, entries);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const score = bmi(profile.weightKg, profile.heightCm);
  const band = bmiBand(score);

  async function ask() {
    setBusy(true);
    setError(null);
    const start = addDaysKey(todayKey(), -6);
    const meals = entries.filter((entry) => entry.type === "meal" && entry.loggedOn >= start);
    const days = new Set(meals.map((entry) => entry.loggedOn)).size || 1;
    const totals = meals.reduce(
      (acc, entry) => {
        if (entry.type !== "meal") return acc;
        const m = sumMacros(entry.meal.items);
        acc.kcal += m.kcal;
        acc.protein += m.protein;
        acc.carbs += m.carbs;
        acc.fat += m.fat;
        return acc;
      },
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );
    const active = entries
      .filter((entry) => entry.type === "activity" && entry.loggedOn >= start)
      .reduce((sum, entry) => sum + (entry.type === "activity" ? entry.activity.minutes : 0), 0);
    try {
      const res = await adviseDiet({
        data: {
          lang: profile.lang,
          bmi: Math.round(score * 10) / 10,
          category: bmiLabel(band, "en"),
          goal: profile.goal,
          kcalTarget: calorieTarget(profile),
          proteinTarget: proteinTarget(profile),
          avgKcal: totals.kcal / days,
          avgProtein: totals.protein / days,
          avgCarbs: totals.carbs / days,
          avgFat: totals.fat / days,
          meals: meals.length,
          activeMinutes: active,
          days: 7,
        },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await onProfile({
        ...profile,
        advice: { ...res.data, at: new Date().toISOString() },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The note didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro kicker="Guidance" title="For you">
        Built from your BMI ({round1(score)}, {bmiLabel(band, profile.lang).toLowerCase()}) and the last week of logs.
      </PageIntro>
      <Card>
        <h2 className="text-3xl">{note.headline}</h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed">
          {note.points.map((point) => (
            <li key={point} className="border-t border-line pt-3">
              {point}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <p className="kicker">A simple day</p>
        <p className="mt-3 whitespace-pre-line font-display text-xl leading-snug">{note.sketch}</p>
      </Card>
      {profile.advice ? (
        <Card>
          <p className="kicker">Written note · {profile.advice.at.slice(0, 10)}</p>
          <h2 className="mt-3 text-3xl">{profile.advice.headline}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {profile.advice.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <p className="mt-4 whitespace-pre-line font-display text-lg leading-snug text-muted">{profile.advice.sketch}</p>
        </Card>
      ) : null}
      {error ? <Banner>{error}</Banner> : null}
      <Button className="w-full" disabled={busy} onClick={() => void ask()}>
        {busy ? "Writing…" : profile.advice ? "Write a fresh note" : "Write a personal note"}
      </Button>
      <p className="text-xs text-muted">
        The note uses your BMI and averages only — not meal names, voice, or video. This is not medical advice.
      </p>
    </div>
  );
}
