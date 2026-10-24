import { FOODS, type Food } from "./foods";

export type Sex = "female" | "male" | "unspecified";
export type Goal = "lose" | "maintain" | "gain";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active";
export type Lang = "en" | "hi";
export type ActivityKind = "walk" | "run" | "cycle" | "strength" | "yoga" | "sport";

export type Per100 = { kcal: number; protein: number; carbs: number; fat: number };

export type MealItem = {
  id: string;
  name: string;
  nameHi: string;
  grams: number;
  per100: Per100;
  source: "table" | "ai";
};

export type MealPayload = {
  title: string;
  transcript: string;
  lang: Lang;
  items: MealItem[];
  hasAudio: boolean;
  hasVideo: boolean;
};

export type ActivityPayload = {
  kind: ActivityKind;
  minutes: number;
  kcal: number;
};

export type WeightPayload = { weightKg: number };

export type EntryPayload =
  | { type: "meal"; meal: MealPayload }
  | { type: "activity"; activity: ActivityPayload }
  | { type: "weight"; weight: WeightPayload };

export type Entry = {
  id: string;
  loggedOn: string;
  createdAt: string;
} & EntryPayload;

export type Profile = {
  heightCm: number;
  weightKg: number;
  age: number | null;
  sex: Sex;
  goal: Goal;
  activity: ActivityLevel;
  lang: Lang;
  advice: { headline: string; points: string[]; sketch: string; at: string } | null;
};

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

export const ACTIVITIES: { id: ActivityKind; label: string; hi: string; met: number }[] = [
  { id: "walk", label: "Walk", hi: "चलना", met: 3.5 },
  { id: "run", label: "Run", hi: "दौड़ना", met: 9 },
  { id: "cycle", label: "Cycle", hi: "साइकिल", met: 7.5 },
  { id: "strength", label: "Strength", hi: "वजन", met: 5 },
  { id: "yoga", label: "Yoga", hi: "योग", met: 2.8 },
  { id: "sport", label: "Sport", hi: "खेल", met: 6.5 },
];

const HINDI_NUMBERS: [string, number][] = [
  ["आधी", 0.5],
  ["आधा", 0.5],
  ["पाँच", 5],
  ["पांच", 5],
  ["एक", 1],
  ["दो", 2],
  ["तीन", 3],
  ["चार", 4],
  ["छह", 6],
  ["सात", 7],
  ["आठ", 8],
  ["नौ", 9],
  ["दस", 10],
];

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return todayKey(date);
}

export function lastNDays(n: number, end = todayKey()): string[] {
  const start = addDaysKey(end, -(n - 1));
  return Array.from({ length: n }, (_, i) => addDaysKey(start, i));
}

export function bmi(weightKg: number, heightCm: number): number {
  const meters = heightCm / 100;
  if (meters <= 0 || weightKg <= 0) return 0;
  return weightKg / (meters * meters);
}

export type BmiBand = "under" | "usual" | "over" | "high";

export function bmiBand(value: number): BmiBand {
  if (value < 18.5) return "under";
  if (value < 25) return "usual";
  if (value < 30) return "over";
  return "high";
}

export function bmiLabel(band: BmiBand, lang: Lang): string {
  const en: Record<BmiBand, string> = {
    under: "Under the usual range",
    usual: "In the usual range",
    over: "Above the usual range",
    high: "Well above the usual range",
  };
  const hi: Record<BmiBand, string> = {
    under: "सामान्य से कम",
    usual: "सामान्य सीमा में",
    over: "सामान्य से ऊपर",
    high: "सामान्य से काफी ऊपर",
  };
  return lang === "hi" ? hi[band] : en[band];
}

export function calorieTarget(profile: Profile): number {
  const weight = profile.weightKg;
  const height = profile.heightCm;
  const age = profile.age ?? 30;
  let bmr = 10 * weight + 6.25 * height - 5 * age;
  if (profile.sex === "male") bmr += 5;
  else if (profile.sex === "female") bmr -= 161;
  else bmr -= 78;
  const mult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }[profile.activity];
  let tdee = bmr * mult;
  const band = bmiBand(bmi(weight, height));
  if (profile.goal === "lose" && band !== "under") tdee -= 400;
  if (profile.goal === "gain" && band !== "high") tdee += 300;
  return Math.round(Math.max(1300, tdee) / 10) * 10;
}

export function proteinTarget(profile: Profile): number {
  const per = profile.goal === "maintain" ? 1.2 : 1.6;
  return Math.round(profile.weightKg * per);
}

export function macroTargets(profile: Profile): Macros {
  const kcal = calorieTarget(profile);
  const protein = proteinTarget(profile);
  const fat = Math.round(profile.weightKg * 0.8);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

export function activityKcal(kind: ActivityKind, minutes: number, weightKg: number): number {
  const met = ACTIVITIES.find((a) => a.id === kind)?.met ?? 3.5;
  return Math.max(0, Math.round(met * weightKg * (minutes / 60)));
}

export function itemFromFood(food: Food, grams = food.defaultGrams, source: MealItem["source"] = "table"): MealItem {
  return {
    id: crypto.randomUUID(),
    name: food.name,
    nameHi: food.hi,
    grams: Math.round(grams),
    per100: { kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat },
    source,
  };
}

export function itemMacros(item: MealItem): Macros {
  const f = item.grams / 100;
  return {
    kcal: item.per100.kcal * f,
    protein: item.per100.protein * f,
    carbs: item.per100.carbs * f,
    fat: item.per100.fat * f,
  };
}

export function sumMacros(items: MealItem[]): Macros {
  return items.reduce(
    (acc, item) => {
      const m = itemMacros(item);
      acc.kcal += m.kcal;
      acc.protein += m.protein;
      acc.carbs += m.carbs;
      acc.fat += m.fat;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function mealTitle(items: MealItem[], lang: Lang, when = new Date()): string {
  const names = items.slice(0, 2).map((item) => (lang === "hi" ? item.nameHi : item.name));
  if (names.length) return names.join(lang === "hi" ? " और " : " & ");
  const hour = when.getHours();
  if (lang === "hi") {
    if (hour < 11) return "नाश्ता";
    if (hour < 16) return "दोपहर का खाना";
    if (hour < 21) return "रात का खाना";
    return "स्नैक";
  }
  if (hour < 11) return "Breakfast";
  if (hour < 16) return "Lunch";
  if (hour < 21) return "Dinner";
  return "Snack";
}

function aliasMatches(text: string, alias: string): boolean {
  if (alias.length < 2) return false;
  if (/[a-z0-9]/.test(alias)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "i").test(text);
  }
  return text.includes(alias);
}

function findFood(text: string): Food | null {
  let best: { food: Food; score: number } | null = null;
  for (const item of FOODS) {
    for (const alias of item.aliases) {
      if (!aliasMatches(text, alias)) continue;
      if (!best || alias.length > best.score) best = { food: item, score: alias.length };
    }
  }
  return best?.food ?? null;
}

function findFoods(text: string): Food[] {
  const found: Food[] = [];
  let rest = text;
  for (let n = 0; n < 6 && rest.trim(); n += 1) {
    const food = findFood(rest);
    if (!food) break;
    let cut = "";
    for (const alias of food.aliases) {
      if (aliasMatches(rest, alias) && alias.length > cut.length) cut = alias;
    }
    if (!cut) break;
    found.push(food);
    const next = rest.replace(new RegExp(cut.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
    if (next === rest) break;
    rest = next;
  }
  return found;
}

type Unit = "g" | "ml" | "katori" | "plate" | "glass" | "cup" | "piece";

function detectUnit(text: string): Unit | null {
  const rules: [Unit, RegExp][] = [
    ["g", /(?:^|\s)\d*(?:\.\d+)?\s*(?:g|gm|gms|grams?|ग्राम)(?:\s|$)/i],
    ["ml", /(?:^|\s)\d*(?:\.\d+)?\s*(?:ml|मिली)(?:\s|$)/i],
    ["katori", /(katoris?|bowls?|कटोरी|कटोरा)/i],
    ["plate", /(plates?|थाली|प्लेट)/i],
    ["glass", /(glasses|glass|गिलास)/i],
    ["cup", /\bcups?\b/i],
    ["piece", /\b(pieces?|pcs?)\b/i],
  ];
  for (const [unit, re] of rules) if (re.test(text)) return unit;
  return null;
}

function stripNoise(text: string): string {
  return text
    .replace(/\b(g|gm|gms|grams?|ml|katoris?|bowls?|plates?|glasses|glass|cups?|pieces?|pcs?|of)\b/gi, " ")
    .replace(/ग्राम|मिली|कटोरी|कटोरा|थाली|प्लेट|गिलास/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function gramsFor(item: Food, qty: number | null, unit: Unit | null): number {
  const n = qty ?? 1;
  const clamp = (v: number) => Math.min(2000, Math.max(5, Math.round(v)));
  if (unit === "g" || unit === "ml") return clamp(qty ?? item.defaultGrams);
  if (unit === "katori" || unit === "cup") return clamp(n * (item.katori ?? 150));
  if (unit === "plate") return clamp(n * (item.plate ?? 250));
  if (unit === "glass") return clamp(n * (item.glass ?? 200));
  if (qty == null && unit == null) return clamp(item.defaultGrams);
  if (item.piece && (unit === "piece" || unit == null)) return clamp(n * item.piece);
  return clamp(n * item.defaultGrams);
}

function takeQuantity(text: string): { qty: number | null; rest: string } {
  let rest = text.replace(/^(?:a|an|some|the)\s+/, "").trim();
  if (/^(half|a half)\b/.test(rest)) {
    return { qty: 0.5, rest: rest.replace(/^(half|a half)\b/, "").trim() };
  }
  for (const [word, n] of HINDI_NUMBERS) {
    if (rest === word || rest.startsWith(`${word} `)) {
      return { qty: n, rest: rest.slice(word.length).trim() };
    }
  }
  const num = rest.match(/^(\d+(?:\.\d+)?)\s*/);
  if (num) return { qty: Number(num[1]), rest: rest.slice(num[0].length).trim() };
  return { qty: null, rest };
}

function parsePart(raw: string): MealItem[] {
  const cleaned = raw
    .toLowerCase()
    .replace(/[।.|,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const { qty, rest } = takeQuantity(cleaned);
  const unit = detectUnit(rest);
  const foods = findFoods(stripNoise(rest));
  if (!foods.length) return [];
  return foods.map((food, index) => itemFromFood(food, gramsFor(food, index === 0 ? qty : null, index === 0 ? unit : null)));
}

export function parseMealText(text: string): MealItem[] {
  const parts = text
    .split(/\s*(?:,|;|\+|&|\n|\band\b|\baur\b|और|के साथ|\bwith\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const merged = new Map<string, MealItem>();
  for (const part of parts) {
    for (const item of parsePart(part)) {
      const prev = merged.get(item.name);
      if (prev) prev.grams += item.grams;
      else merged.set(item.name, { ...item });
    }
  }
  return [...merged.values()];
}

export type CoachNote = { headline: string; points: string[]; sketch: string };

function recentMeals(entries: Entry[], days: number): Entry[] {
  const start = addDaysKey(todayKey(), -(days - 1));
  return entries.filter((entry) => entry.type === "meal" && entry.loggedOn >= start);
}

export function coach(profile: Profile, entries: Entry[]): CoachNote {
  const meals = recentMeals(entries, 7);
  const start = addDaysKey(todayKey(), -6);
  const movement = entries
    .filter((entry) => entry.type === "activity" && entry.loggedOn >= start)
    .reduce((sum, entry) => sum + (entry.type === "activity" ? entry.activity.minutes : 0), 0);
  const target = calorieTarget(profile);
  const protein = proteinTarget(profile);
  const band = bmiBand(bmi(profile.weightKg, profile.heightCm));
  const loggedDays = new Set(meals.map((meal) => meal.loggedOn)).size;
  const totals = meals.reduce(
    (acc, entry) => {
      if (entry.type !== "meal") return acc;
      const m = sumMacros(entry.meal.items);
      acc.kcal += m.kcal;
      acc.protein += m.protein;
      return acc;
    },
    { kcal: 0, protein: 0 },
  );
  const avgKcal = loggedDays ? totals.kcal / loggedDays : 0;
  const avgProtein = loggedDays ? totals.protein / loggedDays : 0;
  const hi = profile.lang === "hi";

  const sketch = sketchFor(profile.goal, band, hi);
  const points: string[] = [];

  if (meals.length === 0) {
    points.push(
      hi
        ? "रोटी, दाल, चावल जैसे शब्द बोलें या लिखें। मात्रा बाद में बदल सकते हैं।"
        : "Say or type ordinary words — roti, dal, rice. You can fix the amount after.",
    );
  } else if (meals.length < 3) {
    points.push(
      hi
        ? "अभी कुछ ही भोजन लिखे हैं। दो-तीन और लिखेंगे तो औसत पूरे दिन जैसा दिखेगा।"
        : "Only a few meals are written down, so this isn't a full day yet. Log the next one the same way.",
    );
  } else if (avgKcal > target + 180 && profile.goal === "lose" && band !== "under") {
    points.push(
      hi
        ? `लिखे हुए दिनों में औसत ${Math.round(avgKcal)} kcal है। अनुमान ${target} है। रात का खाना हल्का रखें।`
        : `On days you logged, meals averaged ${Math.round(avgKcal)} kcal. Your guide is ${target}. A lighter dinner closes most of that.`,
    );
  } else if (avgKcal + 180 < target && profile.goal !== "lose") {
    points.push(
      hi
        ? `औसत ${Math.round(avgKcal)} kcal है, अनुमान ${target}। एक और नाश्ता ठीक रहेगा — केला और दूध, या दही।`
        : `Logged days averaged ${Math.round(avgKcal)} kcal, under your ${target} guide. A banana and milk, or curd, is an easy add.`,
    );
  } else if (loggedDays > 0) {
    points.push(
      hi
        ? `पिछले दिनों का औसत ${Math.round(avgKcal)} kcal है। अनुमान ${target} kcal।`
        : `Recent logged days averaged ${Math.round(avgKcal)} kcal. Your guide is ${target}.`,
    );
  }

  if (band === "under") {
    points.push(
      hi
        ? "बीएमआई सामान्य से कम है, इसलिए यहाँ कैलोरी नहीं काटी जा रही।"
        : "Your BMI is under the usual range, so this guide does not cut calories.",
    );
  } else if (band === "high" || band === "over") {
    points.push(
      hi
        ? "आधी थाली सब्जी, मुट्ठी भर दाल या दही, और रोटी या चावल — इतना काफी है।"
        : "Half the plate vegetables, a handful of dal or curd, then roti or rice. That pattern is enough.",
    );
  }

  if (loggedDays > 0 && avgProtein + 12 < protein) {
    points.push(
      hi
        ? `प्रोटीन औसत ${Math.round(avgProtein)} g है। लक्ष्य करीब ${protein} g। दाल, अंडा, दही या पनीर जोड़ें।`
        : `Protein averaged ${Math.round(avgProtein)} g. About ${protein} g fits your weight. Dal, eggs, curd, or paneer will lift it.`,
    );
  } else if (movement < 60) {
    points.push(
      hi
        ? "इस हफ्ते चलना कम है। दस मिनट की चाल भी रिकॉर्ड कर लें।"
        : "Movement is light this week. A ten-minute walk still counts — log it.",
    );
  } else {
    points.push(
      hi
        ? `इस हफ्ते लगभग ${movement} मिनट की गतिविधि है।`
        : `About ${movement} active minutes are logged this week.`,
    );
  }

  const headline = meals.length === 0
    ? hi
      ? "एक भोजन से शुरू करें"
      : "Start with one honest meal"
    : band === "under"
      ? hi
        ? "खाना छोड़ें नहीं"
        : "Don't skip the plate"
      : profile.goal === "lose"
        ? hi
          ? "हल्का, भूखे नहीं"
          : "Lighter, not hungry"
        : profile.goal === "gain"
          ? hi
            ? "थोड़ा और, नियमित"
            : "A little more, on purpose"
          : hi
            ? "जैसा चल रहा है, वैसा रखें"
            : "Keep the rhythm you have";

  return { headline, points: points.slice(0, 3), sketch };
}

function sketchFor(goal: Goal, band: BmiBand, hi: boolean): string {
  const gaining = goal === "gain" || band === "under";
  const losing = goal === "lose" && band !== "under";
  if (hi) {
    if (gaining) {
      return "नाश्ता: पराठा या ओट्स और एक गिलास दूध।\nदोपहर: चावल, दाल, पनीर या चिकन, दही।\nरात: खिचड़ी या रोटी और सब्जी — खाली न छोड़ें।";
    }
    if (losing) {
      return "नाश्ता: पोहा, या दो अंडे और फल।\nदोपहर: दाल, सब्जी, एक रोटी, सलाद।\nरात: वही सोच, चावल कम।";
    }
    return "नाश्ता: इडली और सांभर, या अंडा और फल।\nदोपहर: सामान्य थाली।\nरात: अगर दोपहर भारी थी तो सब्जी और दही।";
  }
  if (gaining) {
    return "Breakfast: paratha or oats, and a glass of milk.\nLunch: rice, dal, paneer or chicken, curd.\nDinner: don't skip — khichdi, or roti and sabzi, is enough.";
  }
  if (losing) {
    return "Breakfast: poha, or two eggs and fruit.\nLunch: dal, sabzi, one roti, salad.\nDinner: the same idea, with less rice.";
  }
  return "Breakfast: idli and sambar, or eggs and fruit.\nLunch: a normal thali.\nDinner: sabzi and curd if lunch was heavy.";
}

export function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}
