import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getConversation, persistTurn } from "@/lib/conversations.functions";
import { getSubscriptionAccess } from "@/lib/subscription.functions";
import { extractLearningItems } from "@/lib/learning.functions";
import { mintTtsToken } from "@/lib/tts-token.functions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FredAvatar } from "@/components/FredBrand";
import { ArrowLeft, Mic, Pause, Play, Square, Loader2, Keyboard, Send } from "lucide-react";
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
  /** true for user messages typed via keyboard (no audio, render as text bubble) */
  textOnly?: boolean;
};

type Phase = "idle" | "recording" | "transcribing" | "thinking" | "responding";
type Composer = "voice" | "text";

function VoiceMessagePage() {
  const { conversation, messages: initialMsgs } = Route.useLoaderData();
  const navigate = useNavigate();
  const persist = useServerFn(persistTurn);
  const extract = useServerFn(extractLearningItems);
  const mintToken = useServerFn(mintTtsToken);
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
  const [composer, setComposer] = useState<Composer>("voice");
  const [textDraft, setTextDraft] = useState("");
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
        const fail = res as Exclude<typeof res, { ok: true }>;
        toast.error(fail.message);
        if (fail.code === "no_subscription") navigate({ to: "/planos" });
        else if (fail.code === "no_minutes" || fail.code === "pending" || fail.code === "blocked") {
          navigate({ to: "/assinatura" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  useEffect(() => {
    if (!usageReady) return;
    const active = phase !== "idle";
    usage.setActive(active);
    return () => usage.setActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, usageReady]);

  useEffect(() => {
    if (usage.ended) {
      toast.error("Seus minutos acabaram.");
      navigate({ to: "/assinatura" });
    }
  }, [usage.ended, navigate]);

  // ============= Persistent audio element (unlocked on first user gesture) =============
  // Mobile browsers only autoplay through an element that was created/played
  // during a user gesture. We keep ONE element and swap `src` for every reply.
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const playQueueRef = useRef<string[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playingUrlToMsgId = useRef<Map<string, string>>(new Map());

  const ensureAudioEl = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioElRef.current) {
      const el = new Audio();
      el.preload = "auto";
      el.addEventListener("ended", () => {
        setPlayingId(null);
        // play next in queue
        const next = playQueueRef.current.shift();
        if (next && audioElRef.current) {
          audioElRef.current.src = next;
          const mid = playingUrlToMsgId.current.get(next) ?? null;
          setPlayingId(mid);
          audioElRef.current.play().catch(() => setPlayingId(null));
        }
      });
      audioElRef.current = el;
    }
    return audioElRef.current;
  }, []);

  const unlockAudio = useCallback(() => {
    // Call from a user gesture (mic tap, send tap, keyboard toggle).
    const el = ensureAudioEl();
    if (!el || audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    // Play a tiny silent buffer to "warm" the element for later autoplay.
    try {
      const silent =
        "data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA";
      el.src = silent;
      el.muted = true;
      el.play().catch(() => {}).finally(() => {
        el.pause();
        el.muted = false;
      });
    } catch { /* ignore */ }
  }, [ensureAudioEl]);

  const enqueueAudio = useCallback(
    (msgId: string, url: string) => {
      playingUrlToMsgId.current.set(url, msgId);
      const el = ensureAudioEl();
      if (!el) return;
      if (!el.src || el.ended || el.paused) {
        el.src = url;
        setPlayingId(msgId);
        el.play().catch(() => setPlayingId(null));
      } else {
        playQueueRef.current.push(url);
      }
    },
    [ensureAudioEl],
  );

  const togglePlayFromBubble = useCallback(
    (msgId: string, url: string) => {
      const el = ensureAudioEl();
      if (!el) return;
      if (playingId === msgId && !el.paused) {
        el.pause();
        setPlayingId(null);
        return;
      }
      playingUrlToMsgId.current.set(url, msgId);
      el.src = url;
      setPlayingId(msgId);
      el.play().catch(() => setPlayingId(null));
    },
    [ensureAudioEl, playingId],
  );

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
    unlockAudio();
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
    await runAssistantTurn(userMsg);
  }

  async function submitTypedText() {
    const text = textDraft.trim();
    if (!text || phase !== "idle" || !usageReady) return;
    unlockAudio();
    const userMsg: Msg = {
      id: `u_${Date.now()}`,
      role: "user",
      text,
      audioUrl: null,
      durationSec: null,
      textOnly: true,
    };
    setTextDraft("");
    setMessages((prev) => [...prev, userMsg]);
    await runAssistantTurn(userMsg);
  }

  /**
   * Given a just-appended user message, stream Fred's reply from /api/chat and
   * synthesize the audio sentence-by-sentence via /api/tts-stream so playback
   * starts before the full text is ready.
   */
  async function runAssistantTurn(userMsg: Msg) {
    setPhase("thinking");

    // Mint a short-lived TTS token up-front (used by <audio src>).
    let ttsToken: string | null = null;
    try {
      const r = await mintToken();
      ttsToken = r.token;
    } catch (e) {
      console.warn("[tts-token]", e);
    }

    const assistantId = `a_${Date.now()}`;
    // Insert a placeholder so text streams live into the bubble.
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "", audioUrl: null, durationSec: null },
    ]);

    let assistantText = "";
    let sentenceBuf = "";
    let ttsStarted = false;
    // Sequential playback chain: each sentence is fully downloaded to a Blob
    // BEFORE being handed to the audio element. Fetches run in parallel, but
    // enqueue-to-player order is preserved via this promise chain so playback
    // never starts on a half-arrived chunk (which caused mid-sentence stalls).
    let ttsChain: Promise<void> = Promise.resolve();
    const enqueueSentence = (sentence: string) => {
      const clean = sentence.trim();
      if (!clean) return;
      if (!ttsToken) return; // fallback handled after loop
      const params = new URLSearchParams();
      params.set("text", clean.slice(0, 4000));
      params.set("t", ttsToken);
      const sid = usageSessionIdRef.current;
      if (sid) params.set("s", sid);
      params.set("c", conversation.id);
      const url = `/api/tts-stream?${params.toString()}`;
      // Kick off fetch immediately so multiple sentences download in parallel.
      const blobPromise = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`tts ${r.status}`);
          return r.blob();
        })
        .then((b) => URL.createObjectURL(b));
      ttsChain = ttsChain.then(async () => {
        try {
          const blobUrl = await blobPromise;
          if (!ttsStarted) {
            ttsStarted = true;
            setPhase("responding");
          }
          enqueueAudio(assistantId, blobUrl);
        } catch (e) {
          console.warn("[tts-sentence]", e);
        }
      });
    };


    const flushSentenceBuffer = (final = false) => {
      // Split on sentence boundaries followed by whitespace/end.
      const regex = /[^.!?]+[.!?]+(?=\s|$)/g;
      let match: RegExpExecArray | null;
      let lastEnd = 0;
      while ((match = regex.exec(sentenceBuf)) !== null) {
        enqueueSentence(match[0]);
        lastEnd = match.index + match[0].length;
      }
      sentenceBuf = sentenceBuf.slice(lastEnd);
      if (final && sentenceBuf.trim().length > 0) {
        enqueueSentence(sentenceBuf);
        sentenceBuf = "";
      }
    };

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

      await readTextFromUIStream(res.body, (delta) => {
        assistantText += delta;
        sentenceBuf += delta;
        // Update bubble incrementally.
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: assistantText } : m)),
        );
        flushSentenceBuffer(false);
      });
      flushSentenceBuffer(true);
    } catch (e) {
      console.error("[chat]", e);
      toast.error("Fred teve um problema para responder. Tente novamente.");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setPhase("idle");
      return;
    }

    assistantText = assistantText.trim();
    if (!assistantText) {
      toast.error("Fred não respondeu. Tente novamente.");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setPhase("idle");
      return;
    }

    // If TTS streaming didn't kick in (no token), fall back to /api/tts blob.
    if (!ttsStarted) {
      setPhase("responding");
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
          const url = URL.createObjectURL(audioBlob);
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, audioUrl: url } : m)));
          enqueueAudio(assistantId, url);
        }
      } catch (e) {
        console.warn("[tts-fallback]", e);
      }
    } else {
      // Store first streamed URL on the message so the bubble Play button works.
      // (Bubble replays the whole reply from /api/tts on demand.)
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, audioUrl: m.audioUrl } : m)),
      );
    }

    setPhase("idle");

    // Persist + extract (best-effort).
    void persist({
      data: {
        conversationId: conversation.id,
        userMessage: userMsg.text,
        assistantMessage: assistantText,
        inputType: userMsg.textOnly ? "text" : "voice",
      },
    }).catch((e) => console.error("[persist]", e));
    void extract({
      data: {
        conversationId: conversation.id,
        userMessage: userMsg.text,
        assistantMessage: assistantText,
      },
    }).catch((e) => console.error("[extract]", e));
  }

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      audioElRef.current?.pause();
      audioElRef.current = null;
      messages.forEach((m) => m.audioUrl && m.audioUrl.startsWith("blob:") && URL.revokeObjectURL(m.audioUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, phase]);

  const phaseLabel: Record<Phase, string> = {
    idle: composer === "voice" ? "Toque no microfone para gravar" : "Digite sua mensagem",
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
            <p className="text-sm font-medium">Envie sua primeira mensagem 🎙️</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Toque no microfone para falar, ou no teclado para digitar. O Fred responde em áudio.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            msg={m}
            playing={playingId === m.id}
            onPlay={() => m.audioUrl && togglePlayFromBubble(m.id, m.audioUrl)}
          />
        ))}
        {phase === "thinking" && <TypingBubble label="Fred está pensando..." />}
        {phase === "transcribing" && <TypingBubble label="Transcrevendo..." align="end" />}
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 bg-background/95 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {composer === "text" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitTypedText();
            }}
            className="flex items-end gap-2"
          >
            <button
              type="button"
              onClick={() => {
                setComposer("voice");
                setTextDraft("");
              }}
              className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-accent"
              aria-label="Voltar para gravação"
            >
              <Mic className="size-5" />
            </button>
            <textarea
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitTypedText();
                }
              }}
              rows={1}
              placeholder="Escreva em inglês..."
              disabled={isBusy || !usageReady}
              className="min-h-11 max-h-40 flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary/60 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isBusy || !usageReady || !textDraft.trim()}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition active:scale-95 disabled:opacity-50"
              aria-label="Enviar mensagem"
            >
              {isBusy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
            </button>
          </form>
        ) : (
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
              <>
                <button
                  type="button"
                  onClick={() => {
                    unlockAudio();
                    setComposer("text");
                  }}
                  disabled={isBusy}
                  className="grid size-12 place-items-center rounded-full border border-border text-muted-foreground transition hover:bg-accent disabled:opacity-50"
                  aria-label="Digitar mensagem"
                >
                  <Keyboard className="size-5" />
                </button>
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
                <span className="size-12" aria-hidden />
              </>
            )}
          </div>
        )}
        <p className="mt-3 text-center text-xs text-muted-foreground" aria-live="polite">
          {phaseLabel[phase]}
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  playing,
  onPlay,
}: {
  msg: Msg;
  playing: boolean;
  onPlay: () => void;
}) {
  const mine = msg.role === "user";

  // User typed text → plain text bubble.
  if (mine && msg.textOnly) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
          {msg.text}
        </div>
      </div>
    );
  }

  // Assistant streaming text without audio yet → plain text bubble (updates
  // live as tokens arrive); switches to voice bubble once audio is attached.
  if (!mine && !msg.audioUrl) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-2.5 text-sm shadow-sm">
          {msg.text || <span className="text-muted-foreground">…</span>}
        </div>
      </div>
    );
  }

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

/**
 * Reads an AI SDK v5 UI message stream and invokes `onDelta` for every text
 * fragment. Returns after the stream ends.
 */
async function readTextFromUIStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
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
          const d = evt.delta ?? evt.textDelta ?? evt.text ?? "";
          if (d) onDelta(d);
        }
      } catch { /* ignore */ }
    }
  }
}
