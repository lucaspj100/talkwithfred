import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Keyboard, Mic, MicOff, Phone, PhoneOff, Loader2, History } from "lucide-react";
import { FredAvatar as FredBrandAvatar } from "@/components/FredBrand";
import { TalkingAvatar, type TalkingAvatarState } from "@/components/fred/TalkingAvatar";
import { supabase } from "@/integrations/supabase/client";
import { CurrentVoiceCaption, VoiceTranscript } from "@/components/chat/voice-transcript";
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
  onVoiceActiveChange,
  onUsage,
  disabled,
  disabledReason,
  hideEndButton,
  registerEnd,
}: {
  conversationId: string;
  userName: string;
  history: HistoryMessage[];
  onUserFinalTurn?: (text: string) => void;
  onAssistantFinalTurn?: (text: string, opts: { interrupted: boolean }) => void;
  onSwitchToText: () => void;
  onVoiceActiveChange?: (active: boolean) => void;
  onUsage?: (u: {
    usage: unknown;
    responseId: string | null;
    eventId: string | null;
    model: string | null;
  }) => void;
  disabled?: boolean;
  disabledReason?: string | null;
  hideEndButton?: boolean;
  registerEnd?: (fn: (() => void) | null) => void;
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
    mouthSource,
    audioPlaying,
    userSpeaking,
    supported,
    start,
    stop,
    toggleMute,
    retryResponse,
    resumeAudio,
  } = useRealtimeVoice({
    getSession,
    onUserFinalTurn,
    onAssistantFinalTurn,
    onUsage: onUsage as never,
  });

  const [historyOpen, setHistoryOpen] = useState(false);
  const transcriptProps = { history, turns, partialUser, partialAssistant, userName };

  const idle = state === "idle";
  const isError = state === "error";
  const connecting = state === "connecting";

  // Signal "active" only while the voice pipe is actually engaged.
  const voiceIsActive =
    state === "listening" ||
    state === "user-speaking" ||
    state === "fred-thinking" ||
    state === "fred-speaking";
  useEffect(() => {
    onVoiceActiveChange?.(voiceIsActive);
  }, [voiceIsActive, onVoiceActiveChange]);

  // Expose stop() to parent so the "Encerrar" button can trigger a clean disconnect
  // (close peer connection, stop microphone tracks, cancel audio) before navigating.
  useEffect(() => {
    registerEnd?.(stop);
    return () => registerEnd?.(null);
  }, [registerEnd, stop]);


  const effectiveMouthLevel = audioPlaying && !userSpeaking ? mouthLevel : 0;
  const effectiveMouthSource = audioPlaying && !userSpeaking ? mouthSource : "none";
  const effectiveAvatarStatus = audioPlaying && !userSpeaking ? "speaking" : avatarStatus(state);
  const effectiveRingState = audioPlaying && !userSpeaking ? "speaking" : ringState(state);
  const effectiveStateLabel = audioPlaying && !userSpeaking ? "Fred está falando — pode interromper" : stateLabel(state, muted);
  const talkingState: TalkingAvatarState = audioPlaying && !userSpeaking
    ? "speaking"
    : userSpeaking
      ? "listening"
      : state === "fred-thinking" || state === "connecting" || state === "reconnecting"
        ? "thinking"
        : state === "listening"
          ? "listening"
          : "idle";


  if (idle || isError) {
    return (
      <div className="flex min-h-0 flex-col items-center overflow-y-auto overscroll-contain rounded-3xl border border-border bg-card/60 p-6 text-center md:p-10">
        <TalkingAvatar state="idle" size="large" className="mb-6" />
        <h2 className="font-display text-2xl font-bold">Conversa por voz com Fred</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Fale naturalmente. Fred escuta, responde e pode ser interrompido a qualquer momento.
        </p>
        {isError && errorMsg && (
          <p className="mx-auto mt-4 max-w-md rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMsg}
          </p>
        )}
        {disabled && disabledReason && (
          <p className="mx-auto mt-4 max-w-md rounded-md bg-amber-500/10 p-3 text-sm">
            {disabledReason}
          </p>
        )}
        <div className="mt-6 flex flex-col items-center gap-3">
          <Button size="lg" onClick={() => void start()} disabled={!supported || !!disabled}>
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-card/60 p-3 md:block md:flex-none md:overflow-visible md:p-6 [@media(max-height:500px)]:py-2">
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:flex md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("fred-ring h-12 w-12 shrink-0")} data-state={effectiveRingState}>
            <FredBrandAvatar alt="Fred" className="h-12 w-12 ring-0" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Fred</p>
            <p className="truncate text-xs text-muted-foreground">{effectiveStateLabel}</p>
          </div>
        </div>
        {connecting && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="my-3 flex min-h-0 flex-1 flex-col items-center justify-center gap-2 md:my-6 md:flex-none [@media(max-height:500px)]:my-1">
        <TalkingAvatar state={talkingState} mouthLevel={effectiveMouthLevel} size="large" className="shrink-0" avatarClassName="max-md:size-[clamp(3rem,20cqh,10rem)]" />

      </div>

      <CurrentVoiceCaption {...transcriptProps} userSpeaking={userSpeaking} />

      <div className={cn("mt-3 grid shrink-0 gap-1 md:mt-0 md:mb-4 md:flex md:flex-wrap md:items-center md:justify-center md:gap-2 [@media(max-height:500px)]:mt-1.5", hideEndButton ? "grid-cols-3" : "grid-cols-4")}>
        <Button variant="secondary" size="sm" className="min-h-11 min-w-0 px-1.5 text-xs md:min-h-0 md:px-3" onClick={toggleMute}>
          {muted ? <MicOff className="mr-1 size-4" /> : <Mic className="mr-1 size-4" />}
          <span className="md:hidden">{muted ? "Ativar" : "Silenciar"}</span>
          <span className="hidden md:inline">{muted ? "Ativar microfone" : "Silenciar"}</span>
        </Button>
        {!hideEndButton && (
          <Button variant="ghost" size="sm" className="min-h-11 min-w-0 px-1.5 text-xs md:min-h-0 md:px-3" onClick={stop}>
            <PhoneOff className="mr-1 size-4" /> Encerrar
          </Button>
        )}
        <Button variant="ghost" size="sm" className="min-h-11 min-w-0 px-1.5 text-xs md:min-h-0 md:px-3" onClick={onSwitchToText}>
          <Keyboard className="mr-1 size-4" /> <span className="md:hidden">Digitar</span><span className="hidden md:inline">Prefiro digitar</span>
        </Button>
        <Button variant="ghost" size="sm" className="min-h-11 min-w-0 px-1.5 text-xs md:hidden" onClick={() => setHistoryOpen(true)} aria-label="Abrir histórico da conversa">
          <History className="mr-1 size-4" /> Histórico
        </Button>
      </div>

      {responseError && (
        <div className="mt-2 flex max-h-[24cqh] shrink-0 flex-col items-center gap-2 overflow-y-auto overscroll-contain rounded-md bg-destructive/10 p-2 text-center text-sm text-destructive md:mt-0 md:mb-3 md:max-h-none md:p-3">
          <span>{responseError}</span>
          <Button variant="secondary" size="sm" onClick={retryResponse}>
            Tentar resposta novamente
          </Button>
        </div>
      )}

      {audioBlocked && (
        <div className="mt-2 flex max-h-[24cqh] shrink-0 flex-col items-center gap-2 overflow-y-auto overscroll-contain rounded-md bg-gold/10 p-2 text-center text-sm md:mt-0 md:mb-3 md:max-h-none md:p-3">
          <span>Seu iPhone pausou o áudio. Toque para continuar ouvindo Fred.</span>
          <Button variant="secondary" size="sm" onClick={resumeAudio}>
            Reativar áudio
          </Button>
        </div>
      )}

      <VoiceTranscript {...transcriptProps} historyOpen={historyOpen} onHistoryOpenChange={setHistoryOpen} />
    </div>
  );
}

function avatarStatus(s: VoiceState): "idle" | "listening" | "thinking" | "speaking" {
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
    case "connecting": return "Preparando Fred…";
    case "listening": return "Fred está ouvindo";
    case "user-speaking": return "Você está falando…";
    case "fred-thinking": return "Fred está preparando a resposta…";
    case "fred-speaking": return "Fred está falando — pode interromper";
    case "reconnecting": return "Reconectando…";
    case "ended": return "Conversa encerrada";
    case "error": return "Não foi possível iniciar a conversa por voz";
    default: return "";
  }
}

