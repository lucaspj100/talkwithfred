import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight, Keyboard, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { useRealtimeVoice, type VoiceState, type VoiceTurn } from "@/hooks/use-realtime-voice";
import type { LeadDiagnostic } from "@/lib/simulation-prompt";

const MIN_USER_TURNS = 4;
const MAX_USER_TURNS = 6;
const MAX_DURATION_MS = 5 * 60_000;

export function RealtimeVoiceChat({
  leadId,
  diagnostic,
  onSwitchToText,
  onFinish,
}: {
  leadId: string;
  diagnostic: LeadDiagnostic;
  onSwitchToText: () => void;
  onFinish: (transcriptSummary: string) => void | Promise<void>;
}) {
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  const getSession = useCallback(async () => {
    const resp = await fetch("/api/public/realtime-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diagnostic, leadId }),
    });
    if (!resp.ok) {
      const j = (await resp.json().catch(() => ({}))) as { message?: string };
      throw new Error(
        j.message ||
          (resp.status === 429
            ? "Muitas tentativas. Aguarde alguns segundos."
            : resp.status === 503
              ? "A conversa por voz não está disponível neste ambiente. Você pode continuar digitando."
              : "Não foi possível iniciar a conversa por voz."),
      );
    }
    return (await resp.json()) as { client_secret: string; model: string };
  }, [diagnostic, leadId]);

  const {
    state, errorMsg, muted, turns, partialUser, partialAssistant, supported,
    start, stop, toggleMute,
  } = useRealtimeVoice({ getSession });

  const userFinalTurns = useMemo(
    () => turns.filter((t) => t.role === "user" && t.final && t.text.trim().length > 0).length,
    [turns],
  );
  const canFinish = userFinalTurns >= MIN_USER_TURNS;
  const connected =
    state === "listening" || state === "user-speaking" || state === "fred-speaking";

  // Track elapsed time
  useEffect(() => {
    if (connected && !startedAtRef.current) startedAtRef.current = Date.now();
  }, [connected]);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (startedAtRef.current) setElapsed(Date.now() - startedAtRef.current);
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const finish = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setEnding(true);
    stop();
    const name = diagnostic.name?.trim() || "Você";
    const transcript = turns
      .filter((t) => t.final && t.text.trim().length > 0)
      .map((t) => `${t.role === "user" ? name : "Fred"}: ${t.text.trim()}`)
      .join("\n")
      .slice(0, 4000);
    try {
      await onFinish(transcript);
    } catch (err) {
      console.error("[voice] finish failed", err);
      try {
        sessionStorage.setItem("fred_pending_transcript", transcript);
      } catch { /* ignore */ }
    }
  }, [turns, diagnostic.name, stop, onFinish]);

  // Hard stop at 5 min so abandoned sessions don't burn credits.
  useEffect(() => {
    if (elapsed > MAX_DURATION_MS && !finishedRef.current) void finish();
  }, [elapsed, finish]);

  // Wrap up naturally once Fred returns to listening after MAX turns.
  useEffect(() => {
    if (userFinalTurns >= MAX_USER_TURNS && state === "listening" && !finishedRef.current) {
      void finish();
    }
  }, [userFinalTurns, state, finish]);

  const idle = state === "idle";
  const isError = state === "error";

  if (idle || isError) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-6 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-primary/10">
          <Mic className="size-8 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold">Converse com Fred</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Fred vai simular uma situação profissional em inglês. Fale naturalmente — você pode interrompê-lo a qualquer momento.
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
    <div className="rounded-2xl border border-border bg-card/60 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "grid size-10 place-items-center rounded-full bg-primary font-bold text-primary-foreground",
              state === "fred-speaking" && "ring-4 ring-primary/30",
            )}
          >
            F
          </div>
          <div>
            <p className="text-sm font-semibold">Fred</p>
            <p className="text-xs text-muted-foreground">{stateLabel(state, muted)}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="tabular-nums text-xs text-muted-foreground">{formatMs(elapsed)}</p>
          <p className="text-xs text-muted-foreground">
            {userFinalTurns < MIN_USER_TURNS
              ? `Turno ${userFinalTurns}/${MIN_USER_TURNS}`
              : "Pode encerrar quando quiser"}
          </p>
        </div>
      </div>

      <div className="my-6 flex justify-center">
        <VoiceOrb state={state} muted={muted} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" size="sm" onClick={toggleMute}>
          {muted ? <MicOff className="mr-1 size-4" /> : <Mic className="mr-1 size-4" />}
          {muted ? "Ativar microfone" : "Silenciar"}
        </Button>
        {canFinish && (
          <Button size="sm" onClick={() => void finish()} disabled={ending}>
            Ver meu Mapa de Oportunidades <ArrowRight className="ml-1 size-4" />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => void finish()} disabled={ending}>
          <PhoneOff className="mr-1 size-4" /> Encerrar
        </Button>
        <Button variant="ghost" size="sm" onClick={onSwitchToText} disabled={ending}>
          <Keyboard className="mr-1 size-4" /> Voltar a digitar
        </Button>
      </div>

      <TranscriptPanel
        turns={turns}
        partialUser={partialUser}
        partialAssistant={partialAssistant}
        userName={diagnostic.name?.trim() || "Você"}
      />
    </div>
  );
}

function VoiceOrb({ state, muted }: { state: VoiceState; muted: boolean }) {
  const active = state === "user-speaking" || state === "fred-speaking";
  const color =
    muted ? "bg-muted-foreground/30"
    : state === "fred-speaking" ? "bg-primary"
    : state === "user-speaking" ? "bg-emerald-500"
    : state === "connecting" ? "bg-muted-foreground/40"
    : "bg-primary/40";
  return (
    <div className="relative flex size-28 items-center justify-center md:size-32">
      <span className={cn("absolute inset-0 rounded-full opacity-25", color, active && "animate-ping")} />
      <span className={cn("absolute inset-4 rounded-full opacity-40", color)} />
      <span className={cn("relative size-14 rounded-full md:size-16", color)} />
    </div>
  );
}

function TranscriptPanel({
  turns,
  partialUser,
  partialAssistant,
  userName,
}: {
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
  const hasContent = visible.length > 0 || partialUser.trim() || partialAssistant.trim();

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
        <div className="max-h-64 space-y-2 overflow-y-auto px-3 pb-3">
          {!hasContent && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              A transcrição aparece aqui conforme vocês conversam.
            </p>
          )}
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
  role, userName, text, faded,
}: { role: "user" | "assistant"; userName: string; text: string; faded?: boolean }) {
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
          {mine ? userName : "Fred"}
        </span>
        {text}
      </div>
    </div>
  );
}

function stateLabel(s: VoiceState, muted: boolean): string {
  if (muted && (s === "listening" || s === "user-speaking" || s === "fred-speaking")) {
    return "Seu microfone está silenciado";
  }
  switch (s) {
    case "connecting": return "Preparando Fred…";
    case "listening": return "Fred está ouvindo você";
    case "user-speaking": return "Estou te ouvindo…";
    case "fred-speaking": return "Fred está falando — você pode interromper";
    case "reconnecting": return "Reconectando…";
    case "ended": return "Conversa encerrada";
    case "error": return "Não foi possível iniciar a conversa por voz";
    default: return "";
  }
}

function formatMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
