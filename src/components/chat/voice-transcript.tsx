import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { currentVoiceCaption, type VoiceCaption } from "@/lib/current-voice-caption";
import type { VoiceTurn } from "@/hooks/use-realtime-voice";

type TranscriptProps = {
  history: { id: string; role: "user" | "assistant"; content: string }[];
  turns: VoiceTurn[];
  partialUser: string;
  partialAssistant: string;
  userName: string;
};

export function CurrentVoiceCaption(props: TranscriptProps & { userSpeaking: boolean }) {
  const candidate = currentVoiceCaption(props);
  const [retained, setRetained] = useState<VoiceCaption | null>(null);
  const caption = candidate ?? retained;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (candidate) setRetained(candidate);
  }, [candidate?.role, candidate?.text]);

  useLayoutEffect(() => {
    const panel = scrollRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [caption?.role, caption?.text]);

  const mine = caption?.role === "user";
  return (
    <section
      className={cn("flex h-[clamp(5rem,27cqh,13rem)] shrink-0 flex-col overflow-hidden rounded-lg border border-border p-3 [overflow-anchor:none] md:hidden [@media(max-height:500px)]:h-[clamp(4rem,24cqh,6rem)] [@media(max-height:500px)]:p-2", mine ? "bg-secondary" : "bg-fred-soft")}
      aria-label="Legenda atual"
      data-speaker={caption?.role ?? "none"}
    >
      <p className={cn("mb-2 flex shrink-0 items-center gap-2 text-xs font-semibold [@media(max-height:500px)]:mb-1", mine ? "text-foreground" : "text-primary")}>
        <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
        {caption ? (mine ? props.userName : "Fred") : "Fred"}
      </p>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain break-words text-base leading-relaxed" tabIndex={0}>
        <p aria-live="off">{caption?.text ?? "…"}</p>
      </div>
    </section>
  );
}

export function VoiceTranscript({
  historyOpen,
  onHistoryOpenChange,
  ...props
}: TranscriptProps & { historyOpen: boolean; onHistoryOpenChange: (open: boolean) => void }) {
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) onHistoryOpenChange(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [onHistoryOpenChange]);

  return (
    <>
      <div className="hidden md:block">
        <TranscriptPanel {...props} />
      </div>
      <Dialog open={historyOpen} onOpenChange={onHistoryOpenChange}>
        <DialogContent overlayClassName="bg-transparent" className="flex h-[min(36rem,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-[calc(100%-2rem-env(safe-area-inset-left)-env(safe-area-inset-right))] flex-col gap-3 rounded-lg bg-popover p-4">
          <DialogTitle className="shrink-0 pr-8">Histórico da conversa</DialogTitle>
          <DialogDescription className="sr-only">Transcrição completa da conversa com Fred.</DialogDescription>
          <TranscriptPanel {...props} expanded />
        </DialogContent>
      </Dialog>
    </>
  );
}

function TranscriptPanel({ history, turns, partialUser, partialAssistant, userName, expanded = false }: TranscriptProps & { expanded?: boolean }) {
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);

  useLayoutEffect(() => {
    const panel = scrollRef.current;
    if (panel && followingRef.current) panel.scrollTop = panel.scrollHeight;
  }, [history, turns, partialUser, partialAssistant, open]);

  const visible = turns.filter((turn) => turn.text.trim().length > 0);
  const hasContent = history.length > 0 || visible.length > 0 || partialUser.trim() || partialAssistant.trim();

  return (
    <div className={cn(expanded ? "flex min-h-0 flex-1 flex-col" : "rounded-xl border border-border/60 bg-background/40")}>
      {!expanded && (
        <Button type="button" variant="ghost" onClick={() => setOpen((value) => !value)} className="flex h-auto w-full justify-between px-3 py-2 text-xs text-muted-foreground">
          <span>Transcrição</span><span>{open ? "Ocultar" : "Mostrar"}</span>
        </Button>
      )}
      {(open || expanded) && (
        <div
          ref={scrollRef}
          role="region"
          aria-label="Mensagens da conversa"
          tabIndex={0}
          className={cn("space-y-2 overflow-y-auto overscroll-contain px-3 pb-3 [overflow-anchor:none]", expanded ? "min-h-0 flex-1" : "max-h-72")}
          onScroll={(event) => {
            const panel = event.currentTarget;
            followingRef.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 48;
          }}
        >
          {!hasContent && <p className="py-4 text-center text-xs text-muted-foreground">A transcrição aparece aqui conforme vocês conversam.</p>}
          {history.map((message) => <Bubble key={`h_${message.id}`} role={message.role} userName={userName} text={message.content} faded />)}
          {visible.map((turn) => <Bubble key={turn.id} role={turn.role} userName={userName} text={turn.text} />)}
          {partialAssistant.trim() && <Bubble role="assistant" userName={userName} text={partialAssistant} faded />}
          {partialUser.trim() && <Bubble role="user" userName={userName} text={partialUser} faded />}
        </div>
      )}
    </div>
  );
}

function Bubble({ role, userName, text, faded }: { role: "user" | "assistant"; userName: string; text: string; faded?: boolean }) {
  const mine = role === "user";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start", faded && "opacity-60")}>
      <div className={cn("max-w-[85%] break-words rounded-xl px-3 py-1.5 text-sm", mine ? "bg-primary/10" : "border border-border bg-card")}>
        <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">{mine ? userName : "Fred"}</span>{text}
      </div>
    </div>
  );
}