import { format } from "date-fns";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ACTIVITIES, addDaysKey, lastNDays, round1, sumMacros, todayKey, type Entry } from "@/lib/health";
import { Card, PageIntro } from "./ui";

function label(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return format(new Date(y, (m ?? 1) - 1, d ?? 1), "d MMM");
}

const tip = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  color: "var(--ink)",
  fontSize: 12,
};

export function History({ entries }: { entries: Entry[] }) {
  const days = lastNDays(30);
  const start = days[0] ?? todayKey();
  const inRange = entries.filter((entry) => entry.loggedOn >= start);
  const calories = days.map((day) => {
    const kcal = inRange
      .filter((entry) => entry.loggedOn === day && entry.type === "meal")
      .reduce((sum, entry) => sum + (entry.type === "meal" ? sumMacros(entry.meal.items).kcal : 0), 0);
    return { day, label: label(day), kcal: Math.round(kcal) };
  });
  const movement = days.map((day) => ({
    day,
    label: label(day),
    minutes: inRange
      .filter((entry) => entry.loggedOn === day && entry.type === "activity")
      .reduce((sum, entry) => sum + (entry.type === "activity" ? entry.activity.minutes : 0), 0),
  }));
  const weights = inRange
    .filter((entry) => entry.type === "weight")
    .map((entry) => (entry.type === "weight" ? { label: label(entry.loggedOn), kg: entry.weight.weightKg } : null))
    .filter((row): row is { label: string; kg: number } => Boolean(row));

  const mealDays = new Set(inRange.filter((e) => e.type === "meal").map((e) => e.loggedOn)).size;
  const kcalSum = calories.reduce((s, row) => s + row.kcal, 0);
  const avg = mealDays ? Math.round(kcalSum / mealDays) : 0;
  const active = movement.reduce((s, row) => s + row.minutes, 0);
  const loggedMeals = inRange.some((entry) => entry.type === "meal");

  const groups = [...days].reverse().map((day) => ({
    day,
    entries: inRange.filter((entry) => entry.loggedOn === day),
  })).filter((group) => group.entries.length);

  return (
    <div className="space-y-6">
      <PageIntro kicker="Last 30 days" title="This month">
        Kept on your account, and readable only with your key.
      </PageIntro>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Avg kcal" value={avg ? String(avg) : "—"} />
        <Stat label="Days" value={String(mealDays)} />
        <Stat label="Minutes" value={String(active)} />
      </div>
      <Card>
        <h2 className="text-2xl">Calories</h2>
        {loggedMeals ? (
          <div className="mt-3 h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={calories} barSize={6}>
                <XAxis dataKey="label" interval={6} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[0, (max: number) => Math.max(max, 100)]} />
                <Tooltip contentStyle={tip} cursor={{ fill: "var(--soft)" }} />
                <Bar dataKey="kcal" fill="var(--leaf)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Bars appear after the first meal. A month of empty days is a fine place to start.</p>
        )}
      </Card>
      {active > 0 ? (
        <Card>
          <h2 className="text-2xl">Movement</h2>
          <div className="mt-3 h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={movement} barSize={6}>
                <XAxis dataKey="label" interval={6} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="minutes" fill="var(--clay)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}
      {weights.length >= 2 ? (
        <Card>
          <h2 className="text-2xl">Weight</h2>
          <div className="mt-3 h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weights}>
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                <Tooltip contentStyle={tip} />
                <Line type="monotone" dataKey="kg" stroke="var(--leaf)" strokeWidth={2} dot={{ r: 3, fill: "var(--leaf)" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : weights.length === 1 ? (
        <Card>
          <h2 className="text-2xl">Weight</h2>
          <p className="mt-2 text-sm text-muted">One check-in so far: {round1(weights[0]?.kg ?? 0)} kg. A second point draws the line.</p>
        </Card>
      ) : null}
      <div className="space-y-4">
        {groups.length === 0 ? <p className="text-sm text-muted">Nothing in the last 30 days.</p> : null}
        {groups.map((group) => (
          <div key={group.day} className="panel px-5 py-4">
            <h3 className="kicker">{group.day === todayKey() ? "Today" : label(group.day)}</h3>
            <ul className="mt-1 divide-y divide-line">
              {group.entries.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
                  <span className="font-medium">{titleOf(entry)}</span>
                  <span className="shrink-0 tabular-nums text-muted">{detailOf(entry)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">Showing from {label(addDaysKey(todayKey(), -29))}.</p>
    </div>
  );
}

function Stat({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="panel px-4 py-4">
      <p className="text-xs text-muted">{name}</p>
      <p className="mt-2 font-display text-2xl tabular-nums">{value}</p>
    </div>
  );
}

function titleOf(entry: Entry): string {
  if (entry.type === "meal") return entry.meal.title;
  if (entry.type === "weight") return "Weight";
  return ACTIVITIES.find((a) => a.id === entry.activity.kind)?.label ?? "Movement";
}

function detailOf(entry: Entry): string {
  if (entry.type === "meal") return `${Math.round(sumMacros(entry.meal.items).kcal)} kcal`;
  if (entry.type === "weight") return `${round1(entry.weight.weightKg)} kg`;
  return `${entry.activity.minutes} min`;
}
