import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Keyboard, Mic, MicOff, Phone, PhoneOff, Loader2 } from "lucide-react";
import { LucasAvatar as LucasBrandAvatar } from "@/components/LucasBrand";
import { LucasAvatar, type LucasAvatarStatus } from "@/components/lucas/LucasAvatar";
import { supabase } from "@/integrations/supabase/client";
import {
  useRealtimeVoice,
  type VoiceState,
  type VoiceTurn,
} from "@/hooks/use-realtime-voice";

export type HistoryMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function RealtimeConversation({
  conversationId,
  userName,
  history,
  onUserFinalTurn,
  onAssistantFinalTurn,
  onSwitchToText,
}: {
  conversationId: string;
  userName: string;
  history: HistoryMessage[];
  onUserFinalTurn?: (text: string) => void;
  onAssistantFinalTurn?: (text: string, opts: { interrupted: boolean }) => void;
  onSwitchToText: () => void;
}) {
  const getSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sua sessão expirou. Faça login novamente.");
    const resp = await fetch("/api/realtime-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ conversationId }),
    });
    if (!resp.ok) {
      const j = (await resp.json().catch(() => ({}))) as { message?: string };
      throw new Error(
        j.message ||
          (resp.status === 401
            ? "Sua sessão expirou. Faça login novamente."
            : resp.status === 404
              ? "Não encontramos essa conversa."
              : resp.status === 503
                ? "Voz em tempo real indisponível neste ambiente. Você pode continuar digitando."
                : "Não foi possível iniciar a conversa por voz."),
      );
    }
    return (await resp.json()) as { client_secret: string; model: string };
  }, [conversationId]);

  const {
    state,
    errorMsg,
    responseError,
    audioBlocked,
    muted,
    turns,
    partialUser,
    partialAssistant,
    mouthLevel,
    supported,
    start,
    stop,
    toggleMute,
    retryResponse,
    resumeAudio,
  } = useRealtimeVoice({ getSession, onUserFinalTurn, onAssistantFinalTurn });

  const idle = state === "idle";
  const isError = state === "error";
  const connecting = state === "connecting";

  if (idle || isError) {
    return (
      <div className="rounded-3xl border border-border bg-card/60 p-6 text-center md:p-10">
        <div className="mx-auto mb-4 h-28 w-28 md:h-36 md:w-36">
          <div className="fred-ring h-full w-full" data-state="neutral">
            <LucasAvatar status="idle" size="large" showStatus={false} />

          </div>
        </div>
        <h2 className="font-display text-2xl font-bold">Conversa por voz com Lucas</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Fale naturalmente. Lucas escuta, responde e pode ser interrompido a qualquer momento.
        </p>
        {isError && errorMsg && (
          <p className="mx-auto mt-4 max-w-md rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMsg}
          </p>
        )}
        <div className="mt-6 flex flex-col items-center gap-3">
          <Button size="lg" onClick={() => void start()} disabled={!supported}>
            <Phone className="mr-2 size-4" /> Começar conversa por voz
          </Button>
          <button
            type="button"
            onClick={onSwitchToText}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Prefiro digitar
          </button>
        </div>
        {!supported && (
          <p className="mx-auto mt-4 max-w-md text-xs text-muted-foreground">
            Seu navegador não parece suportar conversas por voz em tempo real. Use a versão digitada.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-card/60 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("fred-ring h-12 w-12")} data-state={ringState(state)}>
            <LucasBrandAvatar alt="Lucas" className="h-12 w-12 ring-0" />
          </div>
          <div>
            <p className="text-sm font-semibold">Lucas</p>
            <p className="text-xs text-muted-foreground">{stateLabel(state, muted)}</p>
          </div>
        </div>
        {connecting && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="my-6 flex justify-center">
        <LucasAvatar status={avatarStatus(state)} size="large" showStatus />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" size="sm" onClick={toggleMute}>
          {muted ? <MicOff className="mr-1 size-4" /> : <Mic className="mr-1 size-4" />}
          {muted ? "Ativar microfone" : "Silenciar"}
        </Button>
        <Button variant="ghost" size="sm" onClick={stop}>
          <PhoneOff className="mr-1 size-4" /> Encerrar
        </Button>
        <Button variant="ghost" size="sm" onClick={onSwitchToText}>
          <Keyboard className="mr-1 size-4" /> Prefiro digitar
        </Button>
      </div>

      {responseError && (
        <div className="mb-3 flex flex-col items-center gap-2 rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
          <span>{responseError}</span>
          <Button variant="secondary" size="sm" onClick={retryResponse}>
            Tentar resposta novamente
          </Button>
        </div>
      )}

      {audioBlocked && (
        <div className="mb-3 flex flex-col items-center gap-2 rounded-md bg-amber-500/10 p-3 text-center text-sm">
          <span>Seu iPhone pausou o áudio. Toque para continuar ouvindo Lucas.</span>
          <Button variant="secondary" size="sm" onClick={resumeAudio}>
            Reativar áudio
          </Button>
        </div>
      )}

      <TranscriptPanel
        history={history}
        turns={turns}
        partialUser={partialUser}
        partialAssistant={partialAssistant}
        userName={userName}
      />
    </div>
  );
}

function avatarStatus(s: VoiceState): LucasAvatarStatus {
  switch (s) {
    case "listening":
    case "user-speaking":
      return "listening";
    case "fred-thinking":
    case "connecting":
    case "reconnecting":
      return "thinking";
    case "fred-speaking":
      return "speaking";
    default:
      return "idle";
  }
}

function ringState(s: VoiceState): "neutral" | "listening" | "responding" | "speaking" {
  switch (s) {
    case "user-speaking":
      return "listening";
    case "fred-speaking":
      return "speaking";
    case "fred-thinking":
    case "connecting":
    case "reconnecting":
      return "responding";
    default:
      return "neutral";
  }
}

function stateLabel(s: VoiceState, muted: boolean): string {
  if (muted && (s === "listening" || s === "user-speaking" || s === "fred-speaking")) {
    return "Microfone silenciado";
  }
  switch (s) {
    case "connecting": return "Preparando Lucas…";
    case "listening": return "Lucas está ouvindo";
    case "user-speaking": return "Você está falando…";
    case "fred-thinking": return "Lucas está preparando a resposta…";
    case "fred-speaking": return "Lucas está falando — pode interromper";
    case "reconnecting": return "Reconectando…";
    case "ended": return "Conversa encerrada";
    case "error": return "Não foi possível iniciar a conversa por voz";
    default: return "";
  }
}

function TranscriptPanel({
  history,
  turns,
  partialUser,
  partialAssistant,
  userName,
}: {
  history: HistoryMessage[];
  turns: VoiceTurn[];
  partialUser: string;
  partialAssistant: string;
  userName: string;
}) {
  const [open, setOpen] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, partialUser, partialAssistant]);

  const visible = turns.filter((t) => t.text.trim().length > 0);
  const hasContent =
    history.length > 0 ||
    visible.length > 0 ||
    partialUser.trim() ||
    partialAssistant.trim();

  return (
    <div className="rounded-xl border border-border/60 bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground"
      >
        <span>Transcrição</span>
        <span>{open ? "Ocultar" : "Mostrar"}</span>
      </button>
      {open && (
        <div className="max-h-72 space-y-2 overflow-y-auto px-3 pb-3">
          {!hasContent && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              A transcrição aparece aqui conforme vocês conversam.
            </p>
          )}
          {history.map((m) => (
            <Bubble key={`h_${m.id}`} role={m.role} userName={userName} text={m.content} faded />
          ))}
          {visible.map((t) => (
            <Bubble key={t.id} role={t.role} userName={userName} text={t.text} />
          ))}
          {partialAssistant.trim() && (
            <Bubble role="assistant" userName={userName} text={partialAssistant} faded />
          )}
          {partialUser.trim() && (
            <Bubble role="user" userName={userName} text={partialUser} faded />
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

function Bubble({
  role,
  userName,
  text,
  faded,
}: {
  role: "user" | "assistant";
  userName: string;
  text: string;
  faded?: boolean;
}) {
  const mine = role === "user";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start", faded && "opacity-60")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3 py-1.5 text-sm",
          mine ? "bg-primary/10" : "border border-border bg-card",
        )}
      >
        <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {mine ? userName : "Lucas"}
        </span>
        {text}
      </div>
    </div>
  );
}
