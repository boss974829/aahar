import { useState, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Github, Globe } from "lucide-react";
import { isFramed } from "@/lib/app-data/login";
import { UserButton } from "@/lib/auth/gates";
import type { AppUser } from "@/lib/auth/use-current-user";
import {
  bmi,
  bmiBand,
  bmiLabel,
  calorieTarget,
  round1,
  type Profile,
} from "@/lib/health";
import { Banner, Button, PageIntro } from "./ui";

export function Settings({
  user,
  profile,
  onProfile,
  onClose,
}: {
  user: AppUser;
  profile: Profile;
  onProfile: (profile: Profile) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState<"you" | "dev">("you");
  const score = bmi(draft.weightKg, draft.heightCm);

  if (page === "dev") return <Developer onBack={() => setPage("you")} />;

  async function save() {
    if (draft.heightCm < 120 || draft.heightCm > 230 || draft.weightKg < 30 || draft.weightKg > 250) {
      setError("Height 120–230 cm, weight 30–250 kg.");
      return;
    }
    if (draft.age != null && (draft.age < 13 || draft.age > 100)) {
      setError("Age should be 13 or older, or left blank.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onProfile(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <PageIntro kicker="Account" title="You" />
        <button type="button" className="press mb-1 h-11 px-1 text-sm font-semibold text-sage" onClick={onClose}>
          Done
        </button>
      </div>
      <div className="panel p-5">
        <UserButton />
        <p className="kicker mt-5">Private ID</p>
        <p className="mt-2 break-all font-mono text-xs leading-relaxed text-muted">{user.id}</p>
        <button
          type="button"
          className="press mt-3 h-11 text-sm font-semibold text-sage"
          onClick={() => {
            void navigator.clipboard.writeText(user.id).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied" : "Copy ID"}
        </button>
        <p className="mt-2 text-sm text-muted">Meals are stored only against this ID, and only as ciphertext.</p>
      </div>
      <button type="button" onClick={() => setPage("dev")} className="panel press w-full p-5 text-left">
        <p className="kicker">Developer</p>
        <p className="mt-2 font-display text-2xl text-ink">Aditya Agrahari</p>
        <p className="mt-1 text-sm text-muted">GitHub, page, and a way to write</p>
      </button>
      <p className="text-sm text-muted">
        BMI {round1(score)} · {bmiLabel(bmiBand(score), draft.lang)} · about {calorieTarget(draft).toLocaleString("en-US")} kcal
      </p>
      <label className="block text-sm font-medium">
        Height (cm)
        <input
          inputMode="decimal"
          value={draft.heightCm}
          onChange={(event) => setDraft({ ...draft, heightCm: Number(event.target.value) })}
          className="field"
        />
      </label>
      <label className="block text-sm font-medium">
        Weight (kg)
        <input
          inputMode="decimal"
          value={draft.weightKg}
          onChange={(event) => setDraft({ ...draft, weightKg: Number(event.target.value) })}
          className="field"
        />
      </label>
      <label className="block text-sm font-medium">
        Age
        <input
          inputMode="numeric"
          value={draft.age ?? ""}
          onChange={(event) => setDraft({ ...draft, age: event.target.value ? Number(event.target.value) : null })}
          className="field"
        />
      </label>
      <Pick
        label="Goal"
        value={draft.goal}
        options={[
          ["lose", "Lose a little"],
          ["maintain", "Stay here"],
          ["gain", "Gain some"],
        ]}
        onChange={(goal) => setDraft({ ...draft, goal })}
      />
      <Pick
        label="Days look like"
        value={draft.activity}
        options={[
          ["sedentary", "Mostly sitting"],
          ["light", "Some movement"],
          ["moderate", "Regular exercise"],
          ["active", "Hard training"],
        ]}
        onChange={(activity) => setDraft({ ...draft, activity })}
      />
      <Pick
        label="Estimate uses"
        value={draft.sex}
        options={[
          ["female", "Female"],
          ["male", "Male"],
          ["unspecified", "Not specified"],
        ]}
        onChange={(sex) => setDraft({ ...draft, sex })}
      />
      <Pick
        label="Language for notes"
        value={draft.lang}
        options={[
          ["en", "English"],
          ["hi", "हिन्दी"],
        ]}
        onChange={(lang) => setDraft({ ...draft, lang })}
      />
      {error ? <Banner>{error}</Banner> : null}
      <Button className="w-full" disabled={saving} onClick={() => void save()}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
      <div className="space-y-2 text-sm text-muted">
        <p>Meal text is encrypted in this browser before it is saved. The server stores locked data tied to your ID.</p>
        <p>Voice and video clips stay on this device, also encrypted. They are not uploaded.</p>
        <p>If you forget the passphrase, a new phone cannot open old meals. This phone keeps working.</p>
      </div>
    </div>
  );
}

const DEV = {
  name: "Aditya Agrahari",
  studio: "THE RULE",
  github: "https://github.com/boss974829",
  page: "https://boss974829.github.io/",
  email: "adityaagrahari9797@gmail.com",
};

function openOutside(event: MouseEvent<HTMLAnchorElement>) {
  const url = event.currentTarget.href;
  if (!isFramed()) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      event.preventDefault();
      opened.opener = null;
      return;
    }
  }
  event.preventDefault();
  window.location.assign(url);
}

function Developer({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [viewing, setViewing] = useState(false);

  function openPage(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setViewing(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const who = name.trim();
    const from = email.trim();
    const note = message.trim();
    if (!who || !from || !note || !from.includes("@")) return;
    const subject = encodeURIComponent(`Aahar — message from ${who}`);
    const body = encodeURIComponent(`${note}\n\nFrom ${who}\n${from}`);
    window.location.href = `mailto:${DEV.email}?subject=${subject}&body=${body}`;
    setSent(true);
  }

  if (viewing) {
    return createPortal(
      <div className="fixed inset-0 z-[80] flex h-dvh w-full flex-col bg-[#090a0c] text-[#f3efe6]">
        <div className="safe-top flex items-center justify-between gap-3 px-4 py-3">
          <button type="button" className="press h-11 px-1 text-sm font-semibold" onClick={() => setViewing(false)}>
            Back
          </button>
          <p className="truncate text-sm">Aditya Agrahari</p>
          <a href={DEV.page} className="press h-11 px-1 text-sm font-semibold">
            Full site
          </a>
        </div>
        <iframe title="Aditya Agrahari" src={DEV.page} className="min-h-0 w-full flex-1 border-0 bg-[#090a0c]" />
      </div>,
      document.body,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <PageIntro kicker="Developer" title={DEV.name}>
          {DEV.studio} · India. Aahar stays private. This note does not include your meals.
        </PageIntro>
        <button type="button" className="press mb-1 h-11 shrink-0 px-1 text-sm font-semibold text-sage" onClick={onBack}>
          Back
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a href={DEV.github} onClick={openOutside} className="press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-leaf text-sm font-semibold text-on-leaf">
          <Github size={16} strokeWidth={1.75} />
          GitHub
        </a>
        <a href={DEV.page} onClick={openPage} className="press btn-quiet inline-flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold">
          <Globe size={16} strokeWidth={1.75} />
          Page
        </a>
      </div>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <p className="kicker">Contact</p>
          <h2 className="mt-2 text-2xl text-ink">Write to Aditya</h2>
        </div>
        <label className="block text-sm font-medium">
          Your name
          <input required value={name} onChange={(event) => setName(event.target.value)} className="field" autoComplete="name" />
        </label>
        <label className="block text-sm font-medium">
          Your email
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="field" autoComplete="email" />
        </label>
        <label className="block text-sm font-medium">
          Message
          <textarea required value={message} onChange={(event) => setMessage(event.target.value)} className="field" rows={4} />
        </label>
        <Button type="submit" className="w-full">
          Send message
        </Button>
        {sent ? <p className="text-sm text-muted">Your email app should open with this note, addressed to {DEV.email}.</p> : null}
        <p className="text-sm text-muted">
          Or write directly to{" "}
          <a className="font-semibold text-sage" href={`mailto:${DEV.email}`}>
            {DEV.email}
          </a>
          .
        </p>
      </form>
    </div>
  );
}

function Pick<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {options.map(([id, name]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            className="select press h-12 w-full px-2 text-sm font-semibold"
          >
            {name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

