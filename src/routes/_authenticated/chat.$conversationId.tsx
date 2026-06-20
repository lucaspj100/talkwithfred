import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getConversation, persistTurn } from "@/lib/conversations.functions";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import fredAvatar from "@/assets/fred-avatar.jpg";
import { ArrowLeft, Mic, MicOff, Send, Volume2, Loader2, Square } from "lucide-react";
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
  const [inputType, setInputType] = useState<"text" | "voice">("text");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const t = data.session?.access_token;
          return t ? { Authorization: `Bearer ${t}` } : {};
        },
        body: { mode: conversation.mode as Mode, conversationId: conversation.id },
      }),
    [conversation.id, conversation.mode],
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    id: conversation.id,
    messages: initialUI,
    transport,
    onFinish: async ({ message }) => {
      const last = messages[messages.length - 1];
      const userText = last && last.role === "user" ? extractText(last) : "";
      const assistantText = extractText(message as UIMessage);
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
      toast.error("Fred teve um problema para responder agora. Tente novamente em alguns segundos.");
    },
  });

  const [input, setInput] = useState("");
  const isBusy = status === "submitted" || status === "streaming";

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
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

  // ============= TTS playback =============
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function playMessage(id: string, text: string) {
    try {
      if (playingId === id) { audioRef.current?.pause(); setPlayingId(null); return; }
      audioRef.current?.pause();
      setPlayingId(id);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); };
      await audio.play();
    } catch (e) {
      setPlayingId(null);
      toast.error((e as Error).message || "Falha ao reproduzir");
    }
  }

  // ============= Fred state =============
  const fredState: "neutral" | "listening" | "thinking" | "responding" =
    recording ? "listening"
    : transcribing || status === "submitted" ? "thinking"
    : status === "streaming" || playingId ? "responding"
    : "neutral";

  const stateLabel: Record<typeof fredState, string> = {
    neutral: "Pronto para conversar",
    listening: "Te ouvindo...",
    thinking: "Pensando...",
    responding: "Respondendo...",
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, status]);

  const modeLabel = MODES.find((m) => m.id === conversation.mode)?.label ?? conversation.mode;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 size-4" /> Dashboard
        </Button>
        <p className="text-sm text-muted-foreground">{modeLabel}</p>
        <div className="w-24" />
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
                        {playingId === m.id ? <Square className="size-3" /> : <Volume2 className="size-3" />}
                        {playingId === m.id ? "Parar" : "Ouvir Fred"}
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
