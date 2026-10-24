import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const b64 = z.string().regex(/^[A-Za-z0-9+/=]+$/);

const UpsertLog = z.object({
  id: z.string().uuid(),
  kind: z.enum(["meal", "activity", "weight"]),
  loggedOn: dateKey,
  cipher: b64.max(80_000),
  iv: b64.max(80),
});

const SaveWrap = z.object({
  wrapCipher: b64.max(8_000),
  wrapIv: b64.max(80),
  wrapSalt: b64.max(80),
  profileCipher: b64.max(40_000),
  profileIv: b64.max(80),
});

const SaveProfile = z.object({
  profileCipher: b64.max(40_000),
  profileIv: b64.max(80),
});

const Since = z.object({ since: dateKey });
const IdInput = z.object({ id: z.string().uuid() });

const EstimateInput = z.object({
  text: z.string().max(2_000),
  image: z.string().max(450_000).optional(),
  lang: z.enum(["en", "hi"]),
});

const AdviseInput = z.object({
  lang: z.enum(["en", "hi"]),
  bmi: z.number().finite().min(10).max(80),
  category: z.string().max(60),
  goal: z.enum(["lose", "maintain", "gain"]),
  kcalTarget: z.number().finite().min(800).max(6_000),
  proteinTarget: z.number().finite().min(0).max(400),
  avgKcal: z.number().finite().min(0).max(8_000),
  avgProtein: z.number().finite().min(0).max(800),
  avgCarbs: z.number().finite().min(0).max(1_200),
  avgFat: z.number().finite().min(0).max(800),
  meals: z.number().int().min(0).max(400),
  activeMinutes: z.number().finite().min(0).max(5_000),
  days: z.number().int().min(1).max(30),
});

const TranscribeInput = z.object({
  audioBase64: b64.max(1_800_000),
  mime: z.string().max(100),
  lang: z.enum(["en", "hi"]),
});

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

export const getVault = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<VaultRemote> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      wrap_cipher: string;
      wrap_iv: string;
      wrap_salt: string;
      profile_cipher: string | null;
      profile_iv: string | null;
    }>`
      select wrap_cipher, wrap_iv, wrap_salt, profile_cipher, profile_iv
      from vaults
      where user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      wrapCipher: row.wrap_cipher,
      wrapIv: row.wrap_iv,
      wrapSalt: row.wrap_salt,
      profileCipher: row.profile_cipher,
      profileIv: row.profile_iv,
    };
  });

export const saveWrap = createServerFn({ method: "POST" })
  .validator((input: unknown) => SaveWrap.parse(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into vaults (user_id, wrap_cipher, wrap_iv, wrap_salt, profile_cipher, profile_iv, updated_at)
      values (
        ${context.userId},
        ${data.wrapCipher},
        ${data.wrapIv},
        ${data.wrapSalt},
        ${data.profileCipher},
        ${data.profileIv},
        now()
      )
      on conflict (user_id) do update set
        wrap_cipher = excluded.wrap_cipher,
        wrap_iv = excluded.wrap_iv,
        wrap_salt = excluded.wrap_salt,
        profile_cipher = excluded.profile_cipher,
        profile_iv = excluded.profile_iv,
        updated_at = now()
    `;
    return { ok: true as const };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .validator((input: unknown) => SaveProfile.parse(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ user_id: string }>`
      update vaults
      set profile_cipher = ${data.profileCipher},
          profile_iv = ${data.profileIv},
          updated_at = now()
      where user_id = ${context.userId}
      returning user_id
    `;
    if (!rows[0]) throw new Error("Set up your journal before saving.");
    return { ok: true as const };
  });

export const listLogs = createServerFn({ method: "POST" })
  .validator((input: unknown) => Since.parse(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<LogRemote[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      kind: string;
      logged_on: string;
      cipher: string;
      iv: string;
      created_at: string;
    }>`
      select id, kind, logged_on, cipher, iv,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
      from logs
      where user_id = ${context.userId}
        and logged_on >= ${data.since}::date
      order by logged_on asc, created_at asc
      limit 500
    `;
    return rows
      .filter((row) => row.kind === "meal" || row.kind === "activity" || row.kind === "weight")
      .map((row) => ({
        id: row.id,
        kind: row.kind as LogRemote["kind"],
        loggedOn: row.logged_on,
        cipher: row.cipher,
        iv: row.iv,
        createdAt: row.created_at,
      }));
  });

export const upsertLog = createServerFn({ method: "POST" })
  .validator((input: unknown) => UpsertLog.parse(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into logs (id, user_id, kind, logged_on, cipher, iv)
      values (${data.id}, ${context.userId}, ${data.kind}, ${data.loggedOn}::date, ${data.cipher}, ${data.iv})
      on conflict (id) do update set
        kind = excluded.kind,
        logged_on = excluded.logged_on,
        cipher = excluded.cipher,
        iv = excluded.iv
      where logs.user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const deleteLog = createServerFn({ method: "POST" })
  .validator((input: unknown) => IdInput.parse(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from logs where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

type AiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function grokText(apiKey: string, messages: unknown, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.2,
      max_tokens: maxTokens,
      reasoning_effort: "low",
      messages,
    }),
    signal: AbortSignal.timeout(28_000),
  });
  if (!res.ok) throw new Error(`The estimate service returned ${res.status}.`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

function readJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON");
  return JSON.parse(trimmed.slice(start, end + 1));
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type EstimatedItem = {
  name: string;
  nameHi: string;
  grams: number;
  per100: { kcal: number; protein: number; carbs: number; fat: number };
  source: "ai";
};

export const estimateMeal = createServerFn({ method: "POST" })
  .validator((input: unknown) => EstimateInput.parse(input))
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<AiResult<{ items: EstimatedItem[]; note: string }>> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "Estimates are unavailable right now. Pick foods from the list instead." };
    const text = data.text.trim();
    const image = data.image?.startsWith("data:image/jpeg;base64,") ? data.image : undefined;
    if (text.length < 2 && !image) return { ok: false, error: "Add a description or a photo first." };
    const prompt = [
      "Identify foods in this meal and estimate edible portions.",
      "Reply with JSON only:",
      '{"items":[{"name":"","grams":0,"kcalPer100":0,"proteinPer100":0,"carbsPer100":0,"fatPer100":0}],"note":""}',
      "Use home-cooking values per 100 g. Max 8 items. note under 18 words.",
      "Do not invent drinks or sides that are neither described nor visible.",
      data.lang === "hi" ? "Name foods in Hindi." : "Name foods in English.",
      text ? `Description: ${text}` : "No description. Use the photo only.",
    ].join("\n");
    const content: unknown[] = [{ type: "text", text: prompt }];
    if (image) content.push({ type: "image_url", image_url: { url: image } });
    try {
      const raw = await grokText(
        apiKey,
        [
          { role: "system", content: "You estimate meal portions. You are not a doctor. JSON only." },
          { role: "user", content: image ? content : prompt },
        ],
        700,
      );
      const parsed = readJson(raw) as { items?: unknown; note?: unknown };
      const items: EstimatedItem[] = [];
      if (Array.isArray(parsed.items)) {
        for (const row of parsed.items.slice(0, 8)) {
          if (!row || typeof row !== "object") continue;
          const rec = row as Record<string, unknown>;
          const name = String(rec.name ?? "").trim().slice(0, 80);
          if (!name) continue;
          const grams = clamp(num(rec.grams) ?? 100, 5, 1500);
          let kcal = num(rec.kcalPer100);
          let protein = num(rec.proteinPer100);
          let carbs = num(rec.carbsPer100);
          let fat = num(rec.fatPer100);
          if (kcal == null && num(rec.kcal) != null) {
            const factor = 100 / grams;
            kcal = (num(rec.kcal) ?? 0) * factor;
            protein = (num(rec.protein) ?? 0) * factor;
            carbs = (num(rec.carbs) ?? 0) * factor;
            fat = (num(rec.fat) ?? 0) * factor;
          }
          items.push({
            name,
            nameHi: name,
            grams: Math.round(grams),
            per100: {
              kcal: clamp(kcal ?? 0, 0, 900),
              protein: clamp(protein ?? 0, 0, 100),
              carbs: clamp(carbs ?? 0, 0, 100),
              fat: clamp(fat ?? 0, 0, 100),
            },
            source: "ai",
          });
        }
      }
      if (!items.length) return { ok: false, error: "Nothing recognizable in that meal. Try naming the foods." };
      const note = String(parsed.note ?? "").trim().slice(0, 160);
      return { ok: true, data: { items, note } };
    } catch {
      return { ok: false, error: "The estimate didn't come through. You can still save foods you add yourself." };
    }
  });

export const adviseDiet = createServerFn({ method: "POST" })
  .validator((input: unknown) => AdviseInput.parse(input))
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<AiResult<{ headline: string; points: string[]; sketch: string }>> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "Written notes are unavailable. The guide below still works." };
    const prompt = `Write a short eating note for one adult. Not medical advice. No diagnosis, no supplements, no brand names.
Language: ${data.lang === "hi" ? "simple Hindi in Devanagari" : "plain English"}.
Aggregates only:
BMI ${data.bmi.toFixed(1)} (${data.category}), goal ${data.goal}.
Calorie guide ${data.kcalTarget}. Protein guide ${data.proteinTarget} g.
Last ${data.days} days: ${data.meals} meals, average ${Math.round(data.avgKcal)} kcal, protein ${Math.round(data.avgProtein)} g, carbs ${Math.round(data.avgCarbs)} g, fat ${Math.round(data.avgFat)} g, active minutes ${Math.round(data.activeMinutes)}.
JSON only: {"headline":"","points":["","",""],"sketch":""}
sketch is breakfast, lunch, and dinner in three short lines. Indian home food is welcome. Under 90 words total.`;
    try {
      const raw = await grokText(
        apiKey,
        [
          { role: "system", content: "You write brief, kind diet notes from numbers only. JSON only." },
          { role: "user", content: prompt },
        ],
        450,
      );
      const parsed = readJson(raw) as { headline?: unknown; points?: unknown; sketch?: unknown };
      const headline = String(parsed.headline ?? "").trim().slice(0, 120);
      const points = Array.isArray(parsed.points)
        ? parsed.points.map((p) => String(p).trim()).filter(Boolean).slice(0, 3)
        : [];
      const sketch = String(parsed.sketch ?? "").trim().slice(0, 500);
      if (!headline || points.length < 2 || !sketch) {
        return { ok: false, error: "The note came back incomplete. Try once more." };
      }
      return { ok: true, data: { headline, points, sketch } };
    } catch {
      return { ok: false, error: "The note didn't come through. Try again in a moment." };
    }
  });

const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/3gpp",
  "audio/3gpp2",
  "video/mp4",
  "video/webm",
  "video/3gpp",
]);

export const transcribeClip = createServerFn({ method: "POST" })
  .validator((input: unknown) => TranscribeInput.parse(input))
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<AiResult<{ text: string }>> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "Transcription is unavailable. Type the meal instead." };
    const mime = data.mime.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!AUDIO_TYPES.has(mime)) return { ok: false, error: "That audio format isn't supported." };
    const bytes = Buffer.from(data.audioBase64, "base64");
    if (bytes.byteLength < 80) return { ok: false, error: "That clip was too short to hear." };
    if (bytes.byteLength > 1_200_000) return { ok: false, error: "Keep the voice clip under half a minute." };
    const form = new FormData();
    form.set("model", "grok-voice-transcribe-2.0");
    form.set("language", data.lang);
    if (data.lang === "en") form.set("format", "true");
    const ext = mime.includes("mp4") || mime.includes("3gpp") ? "mp4" : mime.includes("wav") ? "wav" : mime.includes("mpeg") ? "mp3" : "webm";
    form.set("file", new File([bytes], `meal.${ext}`, { type: mime }), `meal.${ext}`);
    try {
      const res = await fetch("https://api.x.ai/v1/stt", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(28_000),
      });
      if (!res.ok) return { ok: false, error: "Transcription didn't succeed. You can type the meal." };
      const json = (await res.json()) as { text?: string };
      const text = (json.text ?? "").trim().slice(0, 2_000);
      if (!text) return { ok: false, error: "No words were heard. Try again a little closer to the phone." };
      return { ok: true, data: { text } };
    } catch {
      return { ok: false, error: "Transcription didn't succeed. You can type the meal." };
    }
  });
