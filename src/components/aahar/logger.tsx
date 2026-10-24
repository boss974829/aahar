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
      ? ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return list.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

async function blobToB64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return bytesToB64(bytes);
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const size = 0x4000;
  for (let i = 0; i < bytes.length; i += size) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + size)));
  }
  return btoa(bin);
}

function nativeSpeech(): { listen: (lang: string) => void; stop: () => void } | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { AaharSpeech?: { listen: (lang: string) => void; stop: () => void } }).AaharSpeech;
  return bridge ?? null;
}

function listenNative(lang: Lang): Promise<string> {
  const bridge = nativeSpeech();
  if (!bridge) return Promise.resolve("");
  return new Promise((resolve) => {
    const host = window as unknown as { __aaharHeard?: (text: string) => void };
    const timer = window.setTimeout(() => resolve(""), 45_000);
    host.__aaharHeard = (text: string) => {
      window.clearTimeout(timer);
      resolve((text || "").trim());
    };
    bridge.listen(lang === "hi" ? "hi-IN" : "en-IN");
  });
}

function listenWeb(lang: Lang): Promise<string> {
  const Ctor = speechCtor();
  if (!Ctor) return Promise.resolve("");
  return new Promise((resolve) => {
    const rec = new Ctor();
    rec.lang = lang === "hi" ? "hi-IN" : "en-IN";
    rec.interimResults = false;
    rec.continuous = false;
    let settled = false;
    const finish = (text: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(text.trim());
    };
    const timer = window.setTimeout(() => {
      try {
        rec.stop();
      } catch {
        finish("");
      }
    }, 8_000);
    rec.onresult = (event) => {
      const said = event.results?.[0]?.[0]?.transcript ?? "";
      finish(said);
    };
    rec.onerror = () => finish("");
    rec.onend = () => {
      window.setTimeout(() => finish(""), 400);
    };
    try {
      rec.start();
    } catch {
      finish("");
    }
  });
}

async function wavFrom(blob: Blob): Promise<{ audioBase64: string; mime: string }> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  const rate = 16000;
  const length = Math.max(1, Math.min(Math.ceil(decoded.duration * rate), rate * 20));
  const offline = new OfflineAudioContext(1, length, rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  await ctx.close();
  const samples = rendered.getChannelData(0);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const data = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + data);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, data, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i += 1, offset += 2) view.setInt16(offset, pcm[i] ?? 0, true);
  return { audioBase64: bytesToB64(new Uint8Array(buffer)), mime: "audio/wav" };
}

async function audioPayload(blob: Blob): Promise<{ audioBase64: string; mime: string }> {
  const mime = (blob.type || "audio/webm").split(";")[0] || "audio/webm";
  const video = mime.startsWith("video/");
  try {
    return await Promise.race([
      wavFrom(blob),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("slow")), 8_000)),
    ]);
  } catch (err) {
    if (!video && blob.size < 900_000) return { audioBase64: await blobToB64(blob), mime };
    throw err instanceof Error && err.message === "slow"
      ? new Error("That clip took too long to read. Say the meal with Speak, or type it.")
      : new Error("That clip couldn't be read. Say the meal with Speak, or type it.");
  }
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

function isHandheld(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

function cameraAllowed(): boolean {
  const doc = document as Document & { permissionsPolicy?: { allowsFeature: (name: string) => boolean } };
  try {
    return doc.permissionsPolicy?.allowsFeature("camera") ?? true;
  } catch {
    return true;
  }
}

function frameFromUrl(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(grabFrame(video));
      video.removeAttribute("src");
      video.load();
    };
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    video.addEventListener(
      "error",
      () => {
        if (settled) return;
        settled = true;
        resolve(null);
      },
      { once: true },
    );
    video.addEventListener(
      "loadeddata",
      () => {
        const duration = video.duration;
        const at = Number.isFinite(duration) && duration > 0 ? Math.min(0.4, duration / 2) : 0;
        if (at <= 0) {
          finish();
          return;
        }
        video.addEventListener("seeked", finish, { once: true });
        try {
          video.currentTime = at;
        } catch {
          finish();
        }
      },
      { once: true },
    );
    window.setTimeout(finish, 2500);
  });
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
  const fileRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    const host = window as unknown as {
      __aaharFilmed?: (bytes: number) => void;
      __aaharFilmError?: (message: string) => void;
    };
    host.__aaharFilmed = (bytes: number) => {
      if (!bytes) return;
      void fetch(`/clips/meal.mp4?t=${Date.now()}`)
        .then((res) => {
          if (!res.ok) throw new Error("missing");
          return res.blob();
        })
        .then((blob) => {
          const file = new File([blob], "meal.mp4", { type: "video/mp4" });
          void useClipFile(file);
        })
        .catch(() => setError("That clip didn't come back. Film it again."));
    };
    host.__aaharFilmError = (message: string) => setError(message || "The camera didn't open.");
    return () => {
      delete host.__aaharFilmed;
      delete host.__aaharFilmError;
    };
    // The phone calls back after the camera closes. useClipFile is the latest save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (touched) return;
    const text = [transcript, interim].filter(Boolean).join(" ").trim();
    setItems(parseMealText(text));
  }, [transcript, interim, touched]);

  useEffect(() => {
    return () => {
      wantSpeech.current = false;
      speechRef.current?.abort();
      audioRec.current?.stop();
      filmRec.current?.stop();
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
    // revoke once on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const video = liveRef.current;
    const stream = streamRef.current;
    if (!cameraOpen || videoUrl || !video || !stream) return;
    video.srcObject = stream;
    video.muted = true;
    void video.play().catch(() => undefined);
  }, [cameraOpen, videoUrl, filming]);

  function stopSpeech() {
    wantSpeech.current = false;
    speechRef.current?.stop();
    speechRef.current = null;
    setListening(false);
    setInterim("");
  }

  function startSpeech(quiet = false) {
    const Ctor = speechCtor();
    if (!Ctor) {
      if (!quiet) setError("This browser can't listen live. Record a clip and transcribe it, or type the meal.");
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
    rec.onerror = (event) => {
      const code = (event as { error?: string }).error;
      if (code === "no-speech" || code === "aborted") return;
      setError("The microphone didn't catch that. You can type instead.");
    };
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
      nativeSpeech()?.stop();
      if (audioRec.current && audioRec.current.state !== "inactive") audioRec.current.stop();
      return;
    }
    const bridge = nativeSpeech();
    if (bridge) {
      setListening(true);
      setError(null);
      void listenNative(lang).then((text) => {
        setListening(false);
        if (!text) {
          setError("No words were heard. Try Speak again, or type the meal.");
          return;
        }
        setTranscript((prev) => [prev.trim(), text].filter(Boolean).join(" "));
        setInterim("");
        setTouched(false);
      });
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
      rec.start(200);
      audioRec.current = rec;
      window.setTimeout(() => {
        if (audioRec.current === rec && rec.state !== "inactive") {
          rec.stop();
          stopSpeech();
          nativeSpeech()?.stop();
        }
      }, 30_000);
    } catch {
      if (!bridge) setError("Voice text can still work if the clip itself couldn't be saved.");
    }
  }

  function pickPhoneClip() {
    fileRef.current?.click();
  }

  function stopLive() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function useClipFile(file: File | null) {
    if (!file) return;
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      setError("That clip didn't come back. Film it again.");
      return;
    }
    if (bytes.byteLength < 1000) {
      setError("That clip didn't come back. Film it again.");
      return;
    }
    if (bytes.byteLength > 12_000_000) {
      setError("That clip is too long to keep. Film about 12 seconds.");
      return;
    }
    const type = file.type.startsWith("video/") ? file.type : "video/mp4";
    const blob = new Blob([bytes], { type });
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(blob);
    setVideoBlob(blob);
    setVideoUrl(url);
    setCameraOpen(false);
    setFilming(false);
    setError(null);
    const still = await frameFromUrl(url);
    if (still) setFrame(still);
  }

  async function openCamera() {
    setError(null);
    setCameraOpen(true);
    setVideoBlob(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    stopLive();
    const video: MediaTrackConstraints = {
      facingMode: { ideal: "environment" },
      width: { ideal: 720 },
      height: { ideal: 960 },
    };
    const attempts: MediaStreamConstraints[] = [
      { video, audio: true },
      { video, audio: false },
      { video: true, audio: false },
    ];
    let stream: MediaStream | null = null;
    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!stream) {
      setCameraOpen(false);
      const denied = lastError instanceof DOMException && (lastError.name === "NotAllowedError" || lastError.name === "SecurityError");
      setError(
        denied
          ? "Camera permission is blocked here. Use the phone camera, or allow the camera and try again."
          : "The camera didn't open. Use the phone camera instead.",
      );
      return;
    }
    streamRef.current = stream;
    setFilming(false);
    const videoEl = liveRef.current;
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.muted = true;
      await videoEl.play().catch(() => undefined);
    }
  }

  function closeCamera() {
    if (filmRec.current && filmRec.current.state !== "inactive") filmRec.current.stop();
    stopLive();
    setFilming(false);
    setCameraOpen(false);
    if (listenToo) stopSpeech();
  }

  function startFilm() {
    const stream = streamRef.current;
    if (!stream) {
      setError("The camera isn't ready. Use the phone camera.");
      return;
    }
    const mime = pickMime("video");
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch {
        setError("This browser can't record in the page. Use the phone camera.");
        return;
      }
    }
    const bits: Blob[] = [];
    rec.ondataavailable = (event) => {
      if (event.data.size) bits.push(event.data);
    };
    rec.onerror = () => {
      setFilming(false);
      setError("Recording stopped. Use the phone camera instead.");
    };
    rec.onstop = () => {
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const blob = new Blob(bits, { type: rec.mimeType || mime || "video/webm" });
      if (liveRef.current) {
        const still = grabFrame(liveRef.current);
        if (still) setFrame(still);
      }
      stopLive();
      setFilming(false);
      if (blob.size < 1000) {
        setError("That clip came out empty. Use the phone camera.");
        return;
      }
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
    };
    try {
      rec.start(250);
    } catch {
      setError("Recording didn't start. Use the phone camera.");
      return;
    }
    filmRec.current = rec;
    setFilming(true);
    setSeconds(0);
    setError(null);
    if (listenToo) startSpeech(true);
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      const s = Math.min(12, Math.round((Date.now() - started) / 1000));
      setSeconds(s);
      if (s >= 12 && rec.state === "recording") {
        if (timerRef.current != null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        rec.stop();
        if (listenToo) stopSpeech();
      }
    }, 250);
  }

  function stopFilm() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = filmRec.current;
    if (rec && rec.state === "recording") rec.stop();
    if (listenToo) stopSpeech();
    setFilming(false);
  }

  function onFilm() {
    const film = (window as unknown as { AaharFilm?: { film: () => void } }).AaharFilm;
    if (film) {
      setError(null);
      film.film();
      return;
    }
    if (isHandheld() || !cameraAllowed() || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      pickPhoneClip();
      return;
    }
    void openCamera();
  }

  async function estimate() {
    const text = [transcript, interim].filter(Boolean).join(" ").trim();
    setError(null);
    const local = parseMealText(text);
    if (local.length) {
      setItems(local);
      setTouched(true);
      setNote("From the home-cooking table. You can change the grams.");
    }
    if (!text && !frame) {
      setError("Type the meal, or add a photo, then estimate.");
      return;
    }
    if (local.length && !frame) return;
    setBusy("Estimating…");
    try {
      const image = frame && frame.length < 400_000 ? frame : undefined;
      const res = await estimateMeal({ data: { text, image, lang } });
      if (!res.ok) {
        if (!local.length) setError(res.error);
        return;
      }
      const incoming = res.data.items.map((item) => ({ ...item, id: crypto.randomUUID() }));
      if (incoming.length) {
        setItems(incoming);
        setTouched(true);
        setNote(res.data.note || null);
      }
    } catch {
      if (!local.length) setError("The estimate didn't come through. Name the foods, or pick them below.");
    } finally {
      setBusy(null);
    }
  }

  function remember(text: string) {
    const heard = text.trim();
    if (!heard) return false;
    setTranscript((prev) => [prev.trim(), heard].filter(Boolean).join(" "));
    setInterim("");
    setTouched(false);
    return true;
  }

  async function transcribe() {
    const clip = audioBlob ?? videoBlob;
    setBusy("Transcribing…");
    setError(null);
    try {
      if (clip) {
        const payload = await audioPayload(clip);
        const res = await transcribeClip({ data: { ...payload, lang } });
        if (res.ok && res.data.text) {
          remember(res.data.text);
          return;
        }
        const needsDevice = !res.ok && (nativeSpeech() != null || /phone|device|unavailable/i.test(res.error));
        if (!needsDevice) {
          if (!res.ok) setError(res.error);
          return;
        }
      }
      setBusy("Listening…");
      const heard = nativeSpeech() ? await listenNative(lang) : await listenWeb(lang);
      if (remember(heard)) return;
      setError("No words were heard. Speak the meal again, a little closer, or type it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription didn't succeed. You can type the meal.");
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
      {error?.includes("phone camera") ? (
        <button type="button" className="press text-sm font-semibold text-sage" onClick={pickPhoneClip}>
          Open phone camera
        </button>
      ) : null}

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
            <button type="button" onClick={onFilm} className="tile press">
              <Camera size={20} strokeWidth={1.75} />
              Film
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            capture="environment"
            aria-label="Film a meal"
            style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0, 0, 0, 0)" }}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void useClipFile(file);
            }}
          />
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
          {videoUrl ? <video src={videoUrl} controls playsInline className="media frame" /> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="quiet"
              className="h-11"
              disabled={!!busy || (![transcript, interim].join("").trim() && !frame)}
              onClick={() => void estimate()}
            >
              {busy === "Estimating…" ? busy : "Estimate nutrients"}
            </Button>
            {audioBlob || videoBlob ? (
              <Button variant="quiet" className="h-11" disabled={!!busy} onClick={() => void transcribe()}>
                {busy === "Transcribing…" || busy === "Listening…" ? busy : "Transcribe clip"}
              </Button>
            ) : null}
            {transcript.trim() ? (
              <Button
                variant="ghost"
                className="h-11"
                onClick={() => {
                  setItems(parseMealText([transcript, interim].filter(Boolean).join(" ")));
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
                  stopLive();
                }}
              >
                Use clip
              </Button>
            </div>
            <button type="button" className="press mt-3 h-11 text-sm font-semibold text-sage" onClick={pickPhoneClip}>
              Phone camera
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
