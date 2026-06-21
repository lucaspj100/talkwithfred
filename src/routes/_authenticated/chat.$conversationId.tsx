import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getConversation, persistTurn } from "@/lib/conversations.functions";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import fredAvatar from "@/assets/fred-avatar.jpg";
import { ArrowLeft, Mic, MicOff, Send, Volume2, Loader2, Square, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { MODES, type Mode } from "@/lib/fred-prompt";

export const Route = createFileRoute("/_authenticated/chat/$conversationId")({
  loader: async ({ params }) => {
    const data = await getConversation({ data: { id: params.conversationId } });
    return data;
  },
  component: ChatPage,
});

type DBMessage = { id: string; role: "user" | "assistant"; content: string; input_type: string; created_at: string };

function toUIMessages(msgs: DBMessage[]): UIMessage[] {
  return msgs.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text", text: m.content }],
  })) as UIMessage[];
}

function extractText(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

function ChatPage() {
  const { conversation, messages: initialMsgs } = Route.useLoaderData();
  const navigate = useNavigate();
  const persist = useServerFn(persistTurn);
  const initialUI = useMemo(() => toUIMessages(initialMsgs as DBMessage[]), [initialMsgs]);
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [inputType, setInputType] = useState<"text" | "voice">("text");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setToken(data.session?.access_token ?? null);
      setAuthReady(true);
      if (!data.session) navigate({ to: "/auth" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [navigate]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { mode: conversation.mode as Mode, conversationId: conversation.id },
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
          const { data } = await supabase.auth.getSession();
          const t = data.session?.access_token;
          const headers = new Headers(init?.headers);
          if (t) headers.set("Authorization", `Bearer ${t}`);
          return fetch(input, { ...init, headers });
        }) as typeof fetch,
      }),
    [conversation.id, conversation.mode],
  );

  // ============= TTS playback =============
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [autoplayEnabled, setAutoplayEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("fred:autoplay") !== "0";
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const blockToastShownRef = useRef(false);
  // Seed with initial message IDs so we don't autoplay historical messages.
  const playedIdsRef = useRef<Set<string>>(new Set(initialUI.map((m) => m.id)));

  const persistAutoplay = (v: boolean) => {
    setAutoplayEnabled(v);
    try { window.localStorage.setItem("fred:autoplay", v ? "1" : "0"); } catch { /* ignore */ }
  };

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* ignore */ }
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
    setPlayingId(null);
    setPreparingId(null);
  }, []);

  // Manual playback (button click). Always tries to play; toggles off if already playing.
  async function playMessage(id: string, text: string) {
    if (playingId === id || preparingId === id) { stopAudio(); return; }
    await preparePlayback(id, text, { manual: true });
  }

  // Core: fetch TTS in background, then start playback.
  async function preparePlayback(id: string, text: string, opts: { manual: boolean }) {
    stopAudio();
    setPreparingId(id);
    try {
      const { data } = await supabase.auth.getSession();
      const t = data.session?.access_token ?? token;
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `TTS ${res.status}`));
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
      // If something else started/stopped while we were fetching, abort.
      if (preparingIdRef.current !== id && !opts.manual) {
        URL.revokeObjectURL(url);
        return;
      }
      const audio = new Audio(url);
      audio.onended = () => {
        if (audioRef.current === audio) {
          setPlayingId(null);
          audioRef.current = null;
        }
        URL.revokeObjectURL(url);
        if (currentUrlRef.current === url) currentUrlRef.current = null;
      };
      audio.onerror = () => {
        if (audioRef.current === audio) {
          setPlayingId(null);
          audioRef.current = null;
        }
        URL.revokeObjectURL(url);
        if (currentUrlRef.current === url) currentUrlRef.current = null;
      };
      try {
        await audio.play();
        // Started successfully — commit state.
        audioRef.current = audio;
        currentUrlRef.current = url;
        setPreparingId((p) => (p === id ? null : p));
        setPlayingId(id);
        playedIdsRef.current.add(id);
      } catch (err) {
        URL.revokeObjectURL(url);
        setPreparingId((p) => (p === id ? null : p));
        if ((err as Error)?.name === "NotAllowedError") {
          if (!blockToastShownRef.current) {
            blockToastShownRef.current = true;
            toast.message("Clique em Ativar áudio automático para ouvir Fred automaticamente.");
          }
          persistAutoplay(false);
          // Do NOT mark as played — allow retry once enabled.
        } else if (opts.manual) {
          toast.error("Falha ao reproduzir áudio.");
        }
      }
    } catch (e) {
      console.error("[tts]", e);
      setPreparingId((p) => (p === id ? null : p));
      if (opts.manual) toast.error("Falha ao gerar áudio.");
    }
  }

  // Track latest preparingId for the async race-check above.
  const preparingIdRef = useRef<string | null>(null);
  useEffect(() => { preparingIdRef.current = preparingId; }, [preparingId]);

  const { messages, sendMessage, status } = useChat({
    id: conversation.id,
    messages: initialUI,
    transport,
    onFinish: async ({ message }) => {
      const last = messages[messages.length - 1];
      const userText = last && last.role === "user" ? extractText(last) : "";
      const assistantText = extractText(message as UIMessage);
      if (assistantText && autoplayEnabled && !playedIdsRef.current.has(message.id)) {
        // Fire and forget — background TTS + autoplay.
        void preparePlayback(message.id, assistantText, { manual: false });
      }
      if (!userText || !assistantText) return;
      try {
        await persist({ data: {
          conversationId: conversation.id,
          userMessage: userText,
          assistantMessage: assistantText,
          inputType,
        }});
      } catch (e) { console.error(e); }
      setInputType("text");
    },
    onError: (e) => {
      console.error("[chat]", e);
      const msg = (e as Error)?.message ?? "";
      if (/unauthorized|401/i.test(msg)) {
        toast.error("Sua sessão expirou. Faça login novamente para conversar com Fred.");
        navigate({ to: "/auth" });
      } else {
        toast.error("Fred teve um problema para responder agora. Tente novamente em alguns segundos.");
      }
    },
  });

  const [input, setInput] = useState("");
  const isBusy = status === "submitted" || status === "streaming";

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    if (!authReady) {
      toast.error("Carregando sua sessão, aguarde um instante...");
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      toast.error("Sua sessão expirou. Faça login novamente para conversar com Fred.");
      navigate({ to: "/auth" });
      return;
    }
    // User gesture: re-enable autoplay if previously blocked.
    if (!autoplayEnabled) persistAutoplay(true);
    blockToastShownRef.current = false;
    stopAudio();
    setInput("");
    sendMessage({ text });
  }

  // ============= Voice recording =============
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function toggleRecord() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      if (!autoplayEnabled) persistAutoplay(true);
      blockToastShownRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 1024) { toast.error("Áudio muito curto, tente de novo."); return; }
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("file", blob, `recording.${mime.includes("mp4") ? "mp4" : "webm"}`);
          const res = await fetch("/api/stt", {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: fd,
          });
          if (!res.ok) throw new Error(await res.text());
          const json = await res.json();
          const text: string = (json.text ?? "").trim();
          if (!text) { toast.error("Não consegui entender o áudio."); return; }
          setInputType("voice");
          stopAudio();
          sendMessage({ text });
        } catch (e) {
          toast.error((e as Error).message || "Falha na transcrição");
        } finally { setTranscribing(false); }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone.");
    }
  }

  // ============= Fred state =============
  const fredState: "neutral" | "listening" | "thinking" | "responding" | "preparing" | "speaking" =
    recording ? "listening"
    : transcribing || status === "submitted" ? "thinking"
    : status === "streaming" ? "responding"
    : playingId ? "speaking"
    : preparingId ? "preparing"
    : "neutral";

  const stateLabel: Record<typeof fredState, string> = {
    neutral: "Pronto para conversar",
    listening: "Te ouvindo...",
    thinking: "Pensando...",
    responding: "Respondendo...",
    preparing: "Preparando áudio...",
    speaking: "Fred está falando...",
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, status]);

  // Cleanup on unmount
  useEffect(() => () => stopAudio(), [stopAudio]);

  const modeLabel = MODES.find((m) => m.id === conversation.mode)?.label ?? conversation.mode;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 size-4" /> Dashboard
        </Button>
        <p className="hidden text-sm text-muted-foreground sm:block">{modeLabel}</p>
        <Button
          type="button"
          variant={autoplayEnabled ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            const next = !autoplayEnabled;
            persistAutoplay(next);
            blockToastShownRef.current = false;
            toast.message(next ? "Áudio automático ativado." : "Áudio automático desativado.");
          }}
          title={autoplayEnabled ? "Desativar áudio automático" : "Ativar áudio automático"}
        >
          {autoplayEnabled ? <Volume2 className="mr-1 size-4" /> : <VolumeX className="mr-1 size-4" />}
          {autoplayEnabled ? "Áudio auto: on" : "Ativar áudio automático"}
        </Button>
      </header>

      <div className="grid flex-1 gap-6 md:grid-cols-[260px,1fr]">
        {/* Fred panel */}
        <aside className="hidden flex-col items-center justify-start gap-4 rounded-3xl border border-border bg-card/40 p-6 md:flex">
          <div className="fred-ring h-44 w-44" data-state={fredState}>
            <img src={fredAvatar} alt="Fred" width={1024} height={1024} loading="lazy" className="h-44 w-44 rounded-full object-cover" />
          </div>
          <p className="font-display text-lg font-semibold">Fred</p>
          <p className="text-center text-xs text-muted-foreground">{stateLabel[fredState]}</p>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Seu parceiro de conversação em inglês</p>
        </aside>

        {/* Chat */}
        <section className="flex flex-col rounded-3xl border border-border bg-card/40">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
            <div className="fred-ring h-10 w-10" data-state={fredState}>
              <img src={fredAvatar} alt="Fred" width={128} height={128} loading="lazy" className="h-10 w-10 rounded-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-semibold">Fred</p>
              <p className="text-[11px] text-muted-foreground">{stateLabel[fredState]}</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5" style={{ maxHeight: "calc(100vh - 240px)" }}>
            {messages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-background/40 p-6 text-center">
                <p className="text-sm text-muted-foreground">Diga oi para o Fred em inglês para começar 👋</p>
                <p className="mt-1 text-xs text-muted-foreground">Use o microfone ou digite abaixo.</p>
              </div>
            )}
            {messages.map((m) => {
              const text = extractText(m);
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
                    </div>
                  </div>
                );
              }
              const isPreparing = preparingId === m.id;
              const isPlaying = playingId === m.id;
              return (
                <div key={m.id} className="flex items-start gap-3">
                  <img src={fredAvatar} alt="" width={64} height={64} loading="lazy" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                  <div className="max-w-[85%]">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{text || (status === "streaming" ? "..." : "")}</p>
                    {text && (
                      <button
                        onClick={() => playMessage(m.id, text)}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                      >
                        {isPreparing ? <Loader2 className="size-3 animate-spin" /> : isPlaying ? <Square className="size-3" /> : <Volume2 className="size-3" />}
                        {isPreparing ? "Preparando áudio..." : isPlaying ? "Parar" : "Ouvir Fred"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={onSubmit} className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <Button
                type="button"
                size="icon"
                variant={recording ? "destructive" : "secondary"}
                onClick={toggleRecord}
                disabled={transcribing || isBusy}
                title={recording ? "Parar gravação" : "Falar em inglês"}
              >
                {transcribing ? <Loader2 className="size-4 animate-spin" /> : recording ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
                placeholder={recording ? "Falando..." : "Type in English..."}
                disabled={recording || transcribing}
                rows={1}
                className="min-h-[44px] max-h-32 resize-none"
              />
              <Button type="submit" size="icon" disabled={!input.trim() || isBusy}>
                {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Digite ou aperte o microfone para falar. Enter envia, Shift+Enter quebra linha.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
