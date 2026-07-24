import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getConversation, persistTurn } from "@/lib/conversations.functions";
import { getSubscriptionAccess } from "@/lib/subscription.functions";
import { extractLearningItems } from "@/lib/learning.functions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FredAvatar } from "@/components/FredBrand";
import { ArrowLeft, Mic, Pause, Play, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUsageSession } from "@/hooks/use-usage-session";
import type { Mode } from "@/lib/fred-prompt";
import { MODES } from "@/lib/fred-prompt";

export const Route = createFileRoute("/_authenticated/voice-message/$conversationId")({
  loader: async ({ params }) => {
    const access = await getSubscriptionAccess();
    if (!access.hasAccess) {
      if (!access.hasSubscription) throw redirect({ to: "/planos" });
      throw redirect({ to: "/assinatura" });
    }
    const data = await getConversation({ data: { id: params.conversationId } });
    return data;
  },
  component: VoiceMessagePage,
});

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  audioUrl: string | null;
  durationSec: number | null;
};

type Phase = "idle" | "recording" | "transcribing" | "thinking" | "responding";

const CHAT_MODEL = "google/gemini-3.1-flash-lite";

function VoiceMessagePage() {
  const { conversation, messages: initialMsgs } = Route.useLoaderData();
  const navigate = useNavigate();
  const persist = useServerFn(persistTurn);
  const extract = useServerFn(extractLearningItems);
  const modeLabel = useMemo(
    () => MODES.find((m) => m.id === (conversation.mode as Mode))?.label ?? conversation.mode,
    [conversation.mode],
  );

  const [messages, setMessages] = useState<Msg[]>(() =>
    (initialMsgs as { id: string; role: "user" | "assistant"; content: string }[]).map((m) => ({
      id: m.id,
      role: m.role,
      text: m.content,
      audioUrl: null,
      durationSec: null,
    })),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setToken(data.session?.access_token ?? null);
      setAuthReady(true);
      if (!data.session) navigate({ to: "/auth" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  // Usage session — text mode (cascade STT→chat→TTS).
  const usage = useUsageSession();
  const [usageReady, setUsageReady] = useState(false);
  const usageSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    usageSessionIdRef.current = usage.sessionId;
  }, [usage.sessionId]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    (async () => {
      const res = await usage.start({ conversationId: conversation.id, mode: "text" });
      if (cancelled) return;
      if ("ok" in res && res.ok) {
        setUsageReady(true);
      } else {
        toast.error(res.message);
        if (res.code === "no_subscription") navigate({ to: "/planos" });
        else if (res.code === "no_minutes" || res.code === "pending" || res.code === "blocked") {
          navigate({ to: "/assinatura" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  // Active tracking — count seconds only during active interaction.
  useEffect(() => {
    if (!usageReady) return;
    const active = phase !== "idle";
    usage.setActive(active);
    return () => usage.setActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, usageReady]);

  // Auto-stop on out-of-minutes.
  useEffect(() => {
    if (usage.ended) {
      toast.error("Seus minutos acabaram.");
      navigate({ to: "/assinatura" });
    }
  }, [usage.ended, navigate]);

  // ============= Recording =============
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recStartRef = useRef<number>(0);
  const [recElapsed, setRecElapsed] = useState(0);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupRec = useCallback(() => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const cancelRec = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch { /* ignore */ }
    cleanupRec();
    setPhase("idle");
    setRecElapsed(0);
  }, [cleanupRec]);

  async function startRecording() {
    if (phase !== "idle") return;
    if (!usageReady) {
      toast.error("Sessão ainda não pronta.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ["audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const duration = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
        cleanupRec();
        setRecElapsed(0);
        if (blob.size < 1024) {
          toast.error("Áudio muito curto. Segure por mais tempo.");
          setPhase("idle");
          return;
        }
        await handleRecordedAudio(blob, mime, duration);
      };
      recorderRef.current = rec;
      recStartRef.current = Date.now();
      rec.start();
      setPhase("recording");
      recTimerRef.current = setInterval(() => {
        setRecElapsed(Math.floor((Date.now() - recStartRef.current) / 1000));
      }, 250);
    } catch (e) {
      console.error("[mic]", e);
      toast.error("Não foi possível acessar o microfone.");
      setPhase("idle");
    }
  }

  function stopRecording() {
    if (phase !== "recording") return;
    try {
      recorderRef.current?.stop();
    } catch { /* ignore */ }
  }

  async function handleRecordedAudio(blob: Blob, mime: string, durationSec: number) {
    // 1) Transcribe
    setPhase("transcribing");
    let transcript = "";
    try {
      const fd = new FormData();
      fd.append("file", blob, `voice.${mime.includes("mp4") ? "mp4" : "webm"}`);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const sid = usageSessionIdRef.current;
      if (sid) {
        headers["x-usage-session-id"] = sid;
        headers["x-conversation-id"] = conversation.id;
      }
      const res = await fetch("/api/stt", { method: "POST", headers, body: fd });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { text?: string };
      transcript = (json.text ?? "").trim();
    } catch (e) {
      console.error("[stt]", e);
      toast.error("Não consegui transcrever seu áudio. Tente de novo.");
      setPhase("idle");
      return;
    }
    if (!transcript) {
      toast.error("Não consegui entender o áudio.");
      setPhase("idle");
      return;
    }

    const userAudioUrl = URL.createObjectURL(blob);
    const userMsg: Msg = {
      id: `u_${Date.now()}`,
      role: "user",
      text: transcript,
      audioUrl: userAudioUrl,
      durationSec,
    };
    setMessages((prev) => [...prev, userMsg]);

    // 2) Chat (non-streaming — collect full text before TTS)
    setPhase("thinking");
    let assistantText = "";
    try {
      const history = [...messages, userMsg].slice(-10).map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: "text", text: m.text }],
      }));
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const sid = usageSessionIdRef.current;
      if (sid) headers["x-usage-session-id"] = sid;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: history,
          mode: conversation.mode,
          conversationId: conversation.id,
        }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "chat failed"));
      // Parse AI SDK UI message stream (SSE-like): "data: {json}\n\n"
      assistantText = await readTextFromUIStream(res.body);
    } catch (e) {
      console.error("[chat]", e);
      toast.error("Fred teve um problema para responder. Tente novamente.");
      setPhase("idle");
      return;
    }
    assistantText = assistantText.trim();
    if (!assistantText) {
      toast.error("Fred não respondeu. Tente novamente.");
      setPhase("idle");
      return;
    }

    // 3) TTS
    setPhase("responding");
    let assistantAudioUrl: string | null = null;
    let assistantDuration: number | null = null;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const sid = usageSessionIdRef.current;
      if (sid) {
        headers["x-usage-session-id"] = sid;
        headers["x-conversation-id"] = conversation.id;
      }
      const res = await fetch("/api/tts", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: assistantText.slice(0, 4000) }),
      });
      if (res.ok) {
        const audioBlob = await res.blob();
        assistantAudioUrl = URL.createObjectURL(audioBlob);
        assistantDuration = await probeDuration(assistantAudioUrl).catch(() => null);
      }
    } catch (e) {
      console.warn("[tts]", e);
    }

    const assistantMsg: Msg = {
      id: `a_${Date.now()}`,
      role: "assistant",
      text: assistantText,
      audioUrl: assistantAudioUrl,
      durationSec: assistantDuration,
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setPhase("idle");

    // Auto-play Fred's reply
    if (assistantAudioUrl) {
      setTimeout(() => playAudioById(assistantMsg.id, assistantAudioUrl!), 100);
    }

    // Persist + extract (best-effort).
    void persist({
      data: {
        conversationId: conversation.id,
        userMessage: transcript,
        assistantMessage: assistantText,
        inputType: "voice",
      },
    }).catch((e) => console.error("[persist]", e));
    void extract({
      data: {
        conversationId: conversation.id,
        userMessage: transcript,
        assistantMessage: assistantText,
      },
    }).catch((e) => console.error("[extract]", e));
  }

  // ============= Audio playback =============
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  function playAudioById(id: string, url: string) {
    if (playingId === id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(url);
    audio.onended = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPlayingId(null);
      }
    };
    audioRef.current = audio;
    setPlayingId(id);
    audio.play().catch(() => {
      setPlayingId(null);
    });
  }

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      messages.forEach((m) => m.audioUrl && URL.revokeObjectURL(m.audioUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, phase]);

  const phaseLabel: Record<Phase, string> = {
    idle: "Toque no microfone para gravar",
    recording: "Gravando...",
    transcribing: "Transcrevendo sua mensagem...",
    thinking: "Fred está pensando...",
    responding: "Fred está respondendo...",
  };

  const isBusy = phase !== "idle" && phase !== "recording";

  return (
    <div className="mx-auto flex h-[100dvh] max-w-3xl flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          aria-label="Voltar"
          className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-accent"
        >
          <ArrowLeft className="size-5" />
        </button>
        <FredAvatar className="size-10" alt="Fred" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-semibold">Fred</p>
          <p className="truncate text-xs text-muted-foreground">
            Mensagem de voz · {modeLabel}
          </p>
        </div>
        {typeof usage.minutesAvailable === "number" && (
          <span className="hidden shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground sm:inline">
            {usage.minutesAvailable} min restantes
          </span>
        )}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center">
            <p className="text-sm font-medium">Envie seu primeiro áudio 🎙️</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Segure ou toque no microfone abaixo, fale em inglês, e o Fred responde em áudio.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <VoiceBubble
            key={m.id}
            msg={m}
            playing={playingId === m.id}
            onPlay={() => m.audioUrl && playAudioById(m.id, m.audioUrl)}
          />
        ))}
        {phase === "thinking" && <TypingBubble label="Fred está pensando..." />}
        {phase === "responding" && <TypingBubble label="Fred está respondendo..." />}
        {phase === "transcribing" && <TypingBubble label="Transcrevendo..." align="end" />}
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 bg-background/95 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-center gap-4">
          {phase === "recording" ? (
            <>
              <button
                onClick={cancelRec}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={stopRecording}
                className="relative grid size-20 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition active:scale-95"
                aria-label="Parar gravação"
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" />
                <Square className="relative size-8" />
              </button>
              <span className="tabular-nums text-sm text-muted-foreground">
                {formatSec(recElapsed)}
              </span>
            </>
          ) : (
            <button
              onClick={startRecording}
              disabled={isBusy || !usageReady}
              className={cn(
                "grid size-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition active:scale-95 disabled:opacity-50",
              )}
              aria-label="Gravar mensagem de voz"
            >
              {isBusy ? (
                <Loader2 className="size-8 animate-spin" />
              ) : (
                <Mic className="size-8" />
              )}
            </button>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground" aria-live="polite">
          {phaseLabel[phase]}
        </p>
      </div>
    </div>
  );
}

function VoiceBubble({
  msg,
  playing,
  onPlay,
}: {
  msg: Msg;
  playing: boolean;
  onPlay: () => void;
}) {
  const mine = msg.role === "user";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[85%] flex-col gap-1", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl px-3 py-2.5 shadow-sm",
            mine
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-card border border-border rounded-bl-md",
          )}
        >
          <button
            type="button"
            onClick={onPlay}
            disabled={!msg.audioUrl}
            aria-label={playing ? "Pausar" : "Reproduzir"}
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full transition",
              mine
                ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"
                : "bg-primary/15 text-primary hover:bg-primary/25",
              !msg.audioUrl && "opacity-40",
            )}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <Waveform mine={mine} playing={playing} />
          <span
            className={cn(
              "shrink-0 tabular-nums text-xs",
              mine ? "text-primary-foreground/80" : "text-muted-foreground",
            )}
          >
            {msg.durationSec ? formatSec(msg.durationSec) : "--:--"}
          </span>
        </div>
        <p
          className={cn(
            "max-w-full px-1 text-xs leading-snug",
            mine ? "text-right text-muted-foreground" : "text-left text-muted-foreground",
          )}
        >
          {msg.text}
        </p>
      </div>
    </div>
  );
}

function Waveform({ mine, playing }: { mine: boolean; playing: boolean }) {
  // Static-ish decorative waveform bars.
  const bars = useMemo(
    () => Array.from({ length: 22 }, (_, i) => 6 + Math.round(Math.sin(i * 1.3) * 6 + Math.cos(i * 0.7) * 4 + 10)),
    [],
  );
  return (
    <div className="flex h-6 items-center gap-[3px]">
      {bars.map((h, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-full",
            mine ? "bg-primary-foreground/70" : "bg-primary/70",
            playing && "animate-pulse",
          )}
          style={{ height: `${Math.min(22, Math.max(4, h))}px` }}
        />
      ))}
    </div>
  );
}

function TypingBubble({ label, align = "start" }: { label: string; align?: "start" | "end" }) {
  return (
    <div className={cn("flex", align === "end" ? "justify-end" : "justify-start")}>
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function formatSec(s: number): string {
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${String(m).padStart(1, "0")}:${String(rest).padStart(2, "0")}`;
}

function probeDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      const d = isFinite(a.duration) ? Math.round(a.duration) : 0;
      resolve(d);
    };
    a.onerror = () => reject(new Error("meta failed"));
    a.src = url;
  });
}

/**
 * Reads an AI SDK v5 UI message stream and returns the accumulated assistant text.
 * The stream is SSE-style: lines of `data: {json}` separated by blank lines.
 * We collect every `text-delta` part.
 */
async function readTextFromUIStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trimEnd();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload) as { type?: string; delta?: string; textDelta?: string; text?: string };
        if (evt.type === "text-delta" || evt.type === "text") {
          out += evt.delta ?? evt.textDelta ?? evt.text ?? "";
        }
      } catch { /* ignore malformed line */ }
    }
  }
  return out;
}
// suppress unused CHAT_MODEL warning (kept as documentation of expected model)
void CHAT_MODEL;
