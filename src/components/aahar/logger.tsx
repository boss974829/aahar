import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Square, Video } from "lucide-react";
import { QUICK_IDS, foodById, searchFoods } from "@/lib/foods";
import {
  ACTIVITIES,
  activityKcal,
  itemFromFood,
  itemMacros,
  mealTitle,
  parseMealText,
  sumMacros,
  type ActivityKind,
  type EntryPayload,
  type Lang,
  type MealItem,
  type Profile,
} from "@/lib/health";
import { estimateMeal, transcribeClip } from "@/lib/records.functions";
import { Banner, Button, Card, PageIntro, Segmented } from "./ui";

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function speechCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickMime(kind: "audio" | "video"): string {
  if (typeof MediaRecorder === "undefined") return "";
  const list =
    kind === "video"
      ? ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return list.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

async function blobToB64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) bin += String.fromCharCode(...bytes.subarray(i, i + size));
  return btoa(bin);
}

function grabFrame(video: HTMLVideoElement): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, 640 / w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export function Logger({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (payload: EntryPayload, media?: { audio?: Blob; video?: Blob }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"meal" | "move" | "weight">("meal");
  const [lang, setLang] = useState<Lang>(profile.lang);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [items, setItems] = useState<MealItem[]>([]);
  const [touched, setTouched] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [filming, setFilming] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [listenToo, setListenToo] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [act, setAct] = useState<ActivityKind>("walk");
  const [minutes, setMinutes] = useState("30");
  const [weight, setWeight] = useState(String(Math.round(profile.weightKg * 10) / 10));
  const [note, setNote] = useState<string | null>(null);

  const speechRef = useRef<SpeechRec | null>(null);
  const wantSpeech = useRef(false);
  const baseText = useRef("");
  const audioRec = useRef<MediaRecorder | null>(null);
  const filmRec = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveRef = useRef<HTMLVideoElement | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (touched) return;
    setItems(parseMealText(transcript));
  }, [transcript, touched]);

  useEffect(() => {
    return () => {
      wantSpeech.current = false;
      speechRef.current?.abort();
      audioRec.current?.stop();
      filmRec.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
    // revoke once on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopSpeech() {
    wantSpeech.current = false;
    speechRef.current?.stop();
    speechRef.current = null;
    setListening(false);
    setInterim("");
  }

  function startSpeech() {
    const Ctor = speechCtor();
    if (!Ctor) {
      setError("This browser can't listen live. Record a clip and transcribe it, or type the meal.");
      return false;
    }
    stopSpeech();
    baseText.current = transcript.trim();
    const rec = new Ctor();
    rec.lang = lang === "hi" ? "hi-IN" : "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    let finals = "";
    rec.onresult = (ev) => {
      let pending = "";
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const text = ev.results[i][0]?.transcript ?? "";
        if (ev.results[i].isFinal) finals = `${finals} ${text}`.trim();
        else pending += text;
      }
      const joined = [baseText.current, finals].filter(Boolean).join(" ");
      setTranscript(joined);
      setInterim(pending);
    };
    rec.onerror = () => setError("The microphone didn't catch that. You can type instead.");
    rec.onend = () => {
      if (wantSpeech.current) {
        try {
          rec.start();
        } catch {
          wantSpeech.current = false;
          setListening(false);
        }
      }
    };
    try {
      rec.start();
    } catch {
      setError("The microphone didn't start. Check permission, or type the meal.");
      return false;
    }
    speechRef.current = rec;
    wantSpeech.current = true;
    setListening(true);
    setError(null);
    return true;
  }

  async function toggleMic() {
    if (listening) {
      stopSpeech();
      if (audioRec.current && audioRec.current.state !== "inactive") audioRec.current.stop();
      return;
    }
    startSpeech();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime("audio");
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) setAudioBlob(blob);
      };
      rec.start();
      audioRec.current = rec;
      window.setTimeout(() => {
        if (audioRec.current === rec && rec.state !== "inactive") {
          rec.stop();
          stopSpeech();
        }
      }, 30_000);
    } catch {
      setError("Voice text can still work if the clip itself couldn't be saved.");
    }
  }

  async function openCamera() {
    setError(null);
    setCameraOpen(true);
    setVideoBlob(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      }
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        await liveRef.current.play().catch(() => undefined);
      }
    } catch {
      setCameraOpen(false);
      setError("The camera isn't available. Type the meal, or use voice only.");
    }
  }

  function closeCamera() {
    filmRec.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setFilming(false);
    setCameraOpen(false);
    if (listenToo) stopSpeech();
  }

  function startFilm() {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = pickMime("video");
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 700_000 } : undefined);
    } catch {
      rec = new MediaRecorder(stream);
    }
    const bits: Blob[] = [];
    rec.ondataavailable = (event) => {
      if (event.data.size) bits.push(event.data);
    };
    rec.onstop = () => {
      const blob = new Blob(bits, { type: rec.mimeType || "video/webm" });
      if (liveRef.current) {
        const still = grabFrame(liveRef.current);
        if (still) setFrame(still);
      }
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (blob.size > 0) {
        setVideoBlob(blob);
        setVideoUrl(URL.createObjectURL(blob));
      }
      setFilming(false);
    };
    rec.start();
    filmRec.current = rec;
    setFilming(true);
    setSeconds(0);
    if (listenToo) startSpeech();
    const started = Date.now();
    const timer = window.setInterval(() => {
      const s = Math.min(12, Math.round((Date.now() - started) / 1000));
      setSeconds(s);
      if (s >= 12 && rec.state !== "inactive") {
        rec.stop();
        if (listenToo) stopSpeech();
        window.clearInterval(timer);
      }
    }, 250);
  }

  function stopFilm() {
    if (filmRec.current && filmRec.current.state !== "inactive") filmRec.current.stop();
    if (listenToo) stopSpeech();
    setFilming(false);
  }

  async function estimate() {
    setBusy("Estimating…");
    setError(null);
    try {
      const res = await estimateMeal({ data: { text: transcript, image: frame ?? undefined, lang } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const incoming = res.data.items.map((item) => ({ ...item, id: crypto.randomUUID() }));
      setItems((prev) => {
        const names = new Set(prev.map((item) => item.name.toLowerCase()));
        const extra = incoming.filter((item) => !names.has(item.name.toLowerCase()));
        return extra.length ? [...prev, ...extra] : incoming;
      });
      setTouched(true);
      setNote(res.data.note || null);
    } finally {
      setBusy(null);
    }
  }

  async function transcribe() {
    if (!audioBlob) return;
    setBusy("Transcribing…");
    setError(null);
    try {
      const res = await transcribeClip({
        data: { audioBase64: await blobToB64(audioBlob), mime: audioBlob.type || "audio/webm", lang },
      });
      if (!res.ok) setError(res.error);
      else {
        setTranscript((prev) => [prev.trim(), res.data.text].filter(Boolean).join(" "));
        setTouched(false);
      }
    } finally {
      setBusy(null);
    }
  }

  async function saveMeal() {
    if (!items.length) return;
    setBusy("Saving…");
    setError(null);
    stopSpeech();
    try {
      await onSave(
        {
          type: "meal",
          meal: {
            title: mealTitle(items, lang),
            transcript: transcript.trim(),
            lang,
            items,
            hasAudio: Boolean(audioBlob),
            hasVideo: Boolean(videoBlob),
          },
        },
        { audio: audioBlob ?? undefined, video: videoBlob ?? undefined },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that meal.");
      setBusy(null);
    }
  }

  async function saveMove() {
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins < 1 || mins > 300) {
      setError("Minutes should be between 1 and 300.");
      return;
    }
    setBusy("Saving…");
    try {
      await onSave({
        type: "activity",
        activity: { kind: act, minutes: Math.round(mins), kcal: activityKcal(act, mins, profile.weightKg) },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
      setBusy(null);
    }
  }

  async function saveWeight() {
    const kg = Number(weight);
    if (!Number.isFinite(kg) || kg < 30 || kg > 250) {
      setError("Enter a weight between 30 and 250 kg.");
      return;
    }
    setBusy("Saving…");
    try {
      await onSave({ type: "weight", weight: { weightKg: Math.round(kg * 10) / 10 } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
      setBusy(null);
    }
  }

  const totals = sumMacros(items);
  const results = searchFoods(query);
  const moveKcal = activityKcal(act, Number(minutes) || 0, profile.weightKg);

  return (
    <div className="space-y-6">
      <PageIntro kicker="Log" title="Add">
        Speak, film a few seconds, or both. Nutrients are estimated, then you can edit them.
      </PageIntro>
      <Segmented
        label="What to log"
        value={mode}
        onChange={setMode}
        options={[
          { value: "meal", label: "Meal" },
          { value: "move", label: "Movement" },
          { value: "weight", label: "Weight" },
        ]}
      />
      {error ? <Banner>{error}</Banner> : null}

      {mode === "meal" ? (
        <div className="space-y-4">
          <Segmented
            label="Language"
            value={lang}
            onChange={setLang}
            options={[
              { value: "en", label: "English" },
              { value: "hi", label: "हिन्दी" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void toggleMic()}
              data-on={listening ? "true" : "false"}
              className="tile press"
            >
              {listening ? <Square size={20} strokeWidth={1.75} /> : <Mic size={20} strokeWidth={1.75} />}
              {listening ? "Stop" : "Speak"}
            </button>
            <button type="button" onClick={() => void openCamera()} className="tile press">
              <Camera size={20} strokeWidth={1.75} />
              Film
            </button>
          </div>
          {listening ? (
            <div className="flex h-8 items-center gap-1" aria-hidden="true">
              <span className="eq-bar h-4 w-1 rounded-full bg-leaf" />
              <span className="eq-bar h-6 w-1 rounded-full bg-leaf" />
              <span className="eq-bar h-5 w-1 rounded-full bg-leaf" />
              <span className="eq-bar h-7 w-1 rounded-full bg-leaf" />
              <span className="ml-2 text-sm text-muted">Listening…</span>
            </div>
          ) : null}
          <label className="block text-sm font-medium">
            What was on the plate
            <textarea
              value={interim ? `${transcript} ${interim}`.trim() : transcript}
              onChange={(event) => setTranscript(event.target.value)}
              rows={3}
              placeholder={lang === "hi" ? "दो रोटी, एक कटोरी दाल, और दही" : "2 roti, a katori of dal, and curd"}
              className="field"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {QUICK_IDS.map((id) => {
              const food = foodById(id);
              if (!food) return null;
              return (
                <button
                  key={id}
                  type="button"
                  className="chip press"
                  onClick={() => {
                    setItems((prev) => [...prev, itemFromFood(food)]);
                    setTouched(true);
                  }}
                >
                  {lang === "hi" ? food.hi : food.name}
                </button>
              );
            })}
          </div>
          <label className="block text-sm font-medium">
            Search a food
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="field"
              placeholder="Paneer, dosa, oats…"
            />
          </label>
          {results.length ? (
            <div className="panel overflow-hidden divide-y divide-line">
              {results.map((food) => (
                <button
                  key={food.id}
                  type="button"
                  className="press flex h-12 w-full items-center justify-between px-4 text-left text-sm"
                  onClick={() => {
                    setItems((prev) => [...prev, itemFromFood(food)]);
                    setTouched(true);
                    setQuery("");
                  }}
                >
                  <span>{food.name}</span>
                  <span className="text-muted">{food.hi}</span>
                </button>
              ))}
            </div>
          ) : null}
          {(audioBlob || videoBlob) && (
            <div className="flex flex-wrap gap-2 text-sm">
              {audioBlob ? (
                <span className="chip gap-2">
                  <Mic size={14} /> Voice clip
                  <button type="button" className="text-muted" onClick={() => setAudioBlob(null)} aria-label="Remove voice clip">
                    ×
                  </button>
                </span>
              ) : null}
              {videoBlob ? (
                <span className="chip gap-2">
                  <Video size={14} /> Meal clip
                  <button
                    type="button"
                    className="text-muted"
                    onClick={() => {
                      setVideoBlob(null);
                      setFrame(null);
                      if (videoUrl) URL.revokeObjectURL(videoUrl);
                      setVideoUrl(null);
                    }}
                    aria-label="Remove meal clip"
                  >
                    ×
                  </button>
                </span>
              ) : null}
            </div>
          )}
          {videoUrl ? <video src={videoUrl} controls playsInline className="media" /> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" className="h-11" disabled={!!busy || (!transcript.trim() && !frame)} onClick={() => void estimate()}>
              {busy === "Estimating…" ? busy : "Estimate nutrients"}
            </Button>
            {audioBlob ? (
              <Button variant="quiet" className="h-11" disabled={!!busy} onClick={() => void transcribe()}>
                {busy === "Transcribing…" ? busy : "Transcribe clip"}
              </Button>
            ) : null}
            {transcript.trim() ? (
              <Button
                variant="ghost"
                className="h-11"
                onClick={() => {
                  setItems(parseMealText(transcript));
                  setTouched(false);
                }}
              >
                Match the text
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted">
            Estimate sends the words and one still frame, not the video. The clip itself never leaves this device.
          </p>
          {note ? <p className="text-sm text-muted">{note}</p> : null}
          {items.length ? (
            <Card className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{lang === "hi" ? item.nameHi : item.name}</p>
                    <p className="text-sm tabular-nums text-muted">{Math.round(itemMacros(item).kcal)} kcal</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={2000}
                      value={item.grams}
                      onChange={(event) => {
                        const grams = Number(event.target.value);
                        setTouched(true);
                        setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, grams: Number.isFinite(grams) ? grams : row.grams } : row)));
                      }}
                      className="field field-compact"
                    />
                    <span className="text-sm text-muted">g</span>
                    <button
                      type="button"
                      className="press grid h-11 w-11 place-items-center rounded-full text-muted"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => {
                        setTouched(true);
                        setItems((prev) => prev.filter((row) => row.id !== item.id));
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-sm tabular-nums text-muted">
                {Math.round(totals.kcal)} kcal · P {Math.round(totals.protein)} · C {Math.round(totals.carbs)} · F {Math.round(totals.fat)}
              </p>
            </Card>
          ) : (
            <p className="text-sm text-muted">Matched foods show up here. If a name is missing, search it or estimate.</p>
          )}
          <Button className="w-full" disabled={!items.length || !!busy} onClick={() => void saveMeal()}>
            {busy === "Saving…" ? "Saving…" : "Save meal"}
          </Button>
          <p className="text-xs text-muted">Numbers come from a home-cooking table, or a model if you ask. Adjust grams if the portion looks off.</p>
        </div>
      ) : null}

      {mode === "move" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {ACTIVITIES.map((activity) => (
              <button
                key={activity.id}
                type="button"
                aria-pressed={act === activity.id}
                onClick={() => setAct(activity.id)}
                className="select press h-12 w-full text-sm font-semibold"
              >
                {activity.label}
              </button>
            ))}
          </div>
          <label className="block text-sm font-medium">
            Minutes
            <input
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              className="field field-hero"
            />
          </label>
          <p className="text-sm text-muted">About {moveKcal} kcal at your current weight.</p>
          <Button className="w-full" disabled={!!busy} onClick={() => void saveMove()}>
            Save movement
          </Button>
        </div>
      ) : null}

      {mode === "weight" ? (
        <div className="space-y-4">
          <label className="block text-sm font-medium">
            Weight (kg)
            <input
              inputMode="decimal"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              className="field field-hero"
            />
          </label>
          <p className="text-sm text-muted">This updates your BMI and the daily guide.</p>
          <Button className="w-full" disabled={!!busy} onClick={() => void saveWeight()}>
            Save weight
          </Button>
        </div>
      ) : null}

      {cameraOpen ? (
        <div className="safe-top fixed inset-0 z-30 flex justify-center bg-canvas">
          <div className="flex w-full max-w-md flex-col px-6 py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="kicker">Camera</p>
                <h2 className="mt-1 text-3xl">Meal clip</h2>
              </div>
              <button type="button" className="press h-11 px-1 text-sm font-semibold text-sage" onClick={closeCamera}>
                Close
              </button>
            </div>
            <p className="mt-3 text-sm text-muted">Up to 12 seconds. It is encrypted on this device.</p>
            <div className="media mt-5 overflow-hidden">
              {videoUrl ? (
                <video src={videoUrl} controls playsInline className="frame" />
              ) : (
                <video ref={liveRef} autoPlay muted playsInline className="frame" />
              )}
            </div>
            <label className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span>Also listen in {lang === "hi" ? "Hindi" : "English"}</span>
              <input type="checkbox" checked={listenToo} onChange={(event) => setListenToo(event.target.checked)} className="h-5 w-5" />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {videoUrl ? (
                <Button
                  variant="quiet"
                  onClick={() => {
                    if (videoUrl) URL.revokeObjectURL(videoUrl);
                    setVideoUrl(null);
                    setVideoBlob(null);
                    void openCamera();
                  }}
                >
                  Retake
                </Button>
              ) : (
                <Button variant={filming ? "primary" : "quiet"} onClick={filming ? stopFilm : startFilm}>
                  {filming ? `Stop 0:${String(seconds).padStart(2, "0")}` : "Record"}
                </Button>
              )}
              <Button
                disabled={!videoBlob}
                onClick={() => {
                  setCameraOpen(false);
                  streamRef.current?.getTracks().forEach((track) => track.stop());
                }}
              >
                Use clip
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
