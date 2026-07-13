import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Sparkle, MessageCircle } from "lucide-react";
import {
  AREAS,
  GOALS,
  LEVELS,
  BLOCKS,
  LOST_OPPORTUNITY,
} from "@/lib/simulation-options";
import { createLead, updateLeadSimulation } from "@/lib/leads.functions";
import type { LeadDiagnostic } from "@/lib/simulation-prompt";
import { RealtimeVoiceChat } from "@/components/simulation/realtime-voice-chat";

export const Route = createFileRoute("/simulacao/")({
  head: () => ({
    meta: [
      { title: "Simulação gratuita — Simulador de Inglês para Carreira" },
      {
        name: "description",
        content:
          "Faça uma simulação gratuita com IA, veja onde seu inglês trava e descubra quais oportunidades podem estar ficando fora do seu radar.",
      },
      { property: "og:title", content: "Simulador de Inglês para Carreira — Lucas" },
      {
        property: "og:description",
        content: "Simulação gratuita com IA para profissionais que querem destravar carreira e oportunidades internacionais.",
      },
    ],
  }),
  component: SimulacaoPage,
});

type Step = "diag_area" | "diag_goal" | "diag_level" | "diag_block" | "diag_lost" | "lead" | "chat";

const LeadFormSchema = z.object({
  name: z.string().trim().min(2, "Digite seu nome").max(120),
  email: z.string().trim().email("Email inválido").max(200),
  whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
});

type Diag = {
  areas: string[];
  other_area: string;
  goal: string | null;
  level: string | null;
  main_block: string | null;
  already_lost_opportunity: string | null;
};

function SimulacaoPage() {
  const navigate = useNavigate();
  const create = useServerFn(createLead);
  const updateSim = useServerFn(updateLeadSimulation);

  const [step, setStep] = useState<Step>("diag_area");
  const [chatMode, setChatMode] = useState<"voice" | "text">("voice");
  const [diag, setDiag] = useState<Diag>({
    areas: [],
    other_area: "",
    goal: null,
    level: null,
    main_block: null,
    already_lost_opportunity: null,
  });
  const [lead, setLead] = useState({ name: "", email: "", whatsapp: "" });
  const [leadId, setLeadId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stepOrder: Step[] = ["diag_area", "diag_goal", "diag_level", "diag_block", "diag_lost", "lead", "chat"];
  const stepIdx = stepOrder.indexOf(step);
  const totalSteps = stepOrder.length;

  const set = (patch: Partial<Diag>) => setDiag((p) => ({ ...p, ...patch }));
  const toggleArea = (v: string) =>
    setDiag((p) => ({
      ...p,
      areas: p.areas.includes(v) ? p.areas.filter((x) => x !== v) : [...p.areas, v],
    }));

  const canNext = (() => {
    switch (step) {
      case "diag_area":
        return diag.areas.length > 0 && (!diag.areas.includes("other") || diag.other_area.trim().length > 0);
      case "diag_goal": return !!diag.goal;
      case "diag_level": return !!diag.level;
      case "diag_block": return !!diag.main_block;
      case "diag_lost": return !!diag.already_lost_opportunity;
      default: return true;
    }
  })();

  function goNext() {
    const idx = stepOrder.indexOf(step);
    if (idx < stepOrder.length - 1) setStep(stepOrder[idx + 1]);
  }
  function goBack() {
    const idx = stepOrder.indexOf(step);
    if (idx > 0) setStep(stepOrder[idx - 1]);
  }

  async function submitLead() {
    const parsed = LeadFormSchema.safeParse(lead);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Confira seus dados");
      return;
    }
    setSubmitting(true);
    try {
      const { leadId: id } = await create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          whatsapp: parsed.data.whatsapp || null,
          areas: diag.areas,
          other_area: diag.areas.includes("other") ? diag.other_area.trim() || null : null,
          goal: diag.goal,
          level: diag.level,
          main_block: diag.main_block,
          already_lost_opportunity: diag.already_lost_opportunity,
        },
      });
      setLeadId(id);
      // Persist for the /simulacao/resultado screen.
      sessionStorage.setItem(
        "fred_lead",
        JSON.stringify({
          leadId: id,
          name: parsed.data.name,
          diag,
        }),
      );
      setStep("chat");
    } catch (e) {
      toast.error((e as Error).message || "Não conseguimos salvar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  const diagnosticForChat: LeadDiagnostic = useMemo(
    () => ({
      name: lead.name,
      areas: diag.areas,
      other_area: diag.areas.includes("other") ? diag.other_area.trim() || null : null,
      goal: diag.goal,
      level: diag.level,
      main_block: diag.main_block,
    }),
    [lead.name, diag],
  );

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <a href="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">F</span>
          Speak With Lucas
        </a>
        <span className="text-xs text-muted-foreground">Simulação gratuita</span>
      </header>

      <div className="mx-auto max-w-3xl px-6 pb-16">
        {step !== "chat" && (
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Passo {stepIdx + 1} de {totalSteps}</span>
              <span className="inline-flex items-center gap-1"><Sparkle className="size-3 text-primary" /> ~2 minutos</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${((stepIdx + 1) / totalSteps) * 100}%` }} />
            </div>
          </div>
        )}

        {step === "diag_area" && (
          <StepShell
            title="Quais áreas mais representam sua atuação profissional?"
            subtitle="Pode selecionar mais de uma. Vamos usar isso para adaptar sua análise e a simulação ao seu contexto real."
          >
            <MultiGrid
              options={AREAS as unknown as { value: string; label: string }[]}
              values={diag.areas}
              onToggle={toggleArea}
            />
            {diag.areas.includes("other") && (
              <div className="mt-4">
                <label className="mb-1 block text-sm">Qual sua área?</label>
                <Input
                  value={diag.other_area}
                  onChange={(e) => set({ other_area: e.target.value })}
                  placeholder="Descreva sua área"
                />
              </div>
            )}
          </StepShell>
        )}
        {step === "diag_goal" && (
          <StepShell
            title="Qual seu principal objetivo com inglês?"
            subtitle="Lucas vai simular uma situação de carreira ligada a isso."
          >
            <Grid options={GOALS as unknown as { value: string; label: string }[]} value={diag.goal} onChange={(v) => set({ goal: v })} />
          </StepShell>
        )}
        {step === "diag_level" && (
          <StepShell title="Qual seu nível atual de inglês?">
            <Grid options={LEVELS as unknown as { value: string; label: string }[]} value={diag.level} onChange={(v) => set({ level: v })} />
          </StepShell>
        )}
        {step === "diag_block" && (
          <StepShell title="Onde o inglês mais te limita hoje?">
            <Grid options={BLOCKS as unknown as { value: string; label: string }[]} value={diag.main_block} onChange={(v) => set({ main_block: v })} />
          </StepShell>
        )}
        {step === "diag_lost" && (
          <StepShell title="Você já deixou de se candidatar ou avançar em alguma oportunidade por causa do inglês?">
            <Grid
              options={LOST_OPPORTUNITY as unknown as { value: string; label: string }[]}
              value={diag.already_lost_opportunity}
              onChange={(v) => set({ already_lost_opportunity: v })}
            />
          </StepShell>
        )}

        {step === "lead" && (
          <StepShell
            title="Antes de começar sua simulação"
            subtitle="Para que você receba seu Mapa de Oportunidades no final. Não enviamos spam."
          >
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm">Seu nome</label>
                <Input value={lead.name} onChange={(e) => setLead((p) => ({ ...p, name: e.target.value }))} placeholder="Como Lucas pode te chamar?" />
              </div>
              <div>
                <label className="mb-1 block text-sm">Email</label>
                <Input type="email" value={lead.email} onChange={(e) => setLead((p) => ({ ...p, email: e.target.value }))} placeholder="voce@email.com" />
              </div>
              <div>
                <label className="mb-1 block text-sm">WhatsApp (opcional)</label>
                <Input value={lead.whatsapp} onChange={(e) => setLead((p) => ({ ...p, whatsapp: e.target.value }))} placeholder="+55 11 99999-9999" />
                <p className="mt-1 text-xs text-muted-foreground">Se preencher, agilizamos o envio da sua análise pelo WhatsApp.</p>
              </div>
            </div>
          </StepShell>
        )}

        {step === "chat" && leadId && chatMode === "voice" && (
          <RealtimeVoiceChat
            leadId={leadId}
            diagnostic={diagnosticForChat}
            onSwitchToText={() => setChatMode("text")}
            onFinish={async (transcriptSummary) => {
              try {
                if (transcriptSummary.trim().length > 0) {
                  await updateSim({ data: { leadId, summary: transcriptSummary } });
                }
              } catch (e) {
                console.error(e);
              }
              navigate({ to: "/simulacao/resultado" });
            }}
          />
        )}

        {step === "chat" && leadId && chatMode === "text" && (
          <SimulationChat
            leadId={leadId}
            diagnostic={diagnosticForChat}
            onFinish={async (transcriptSummary) => {
              try {
                await updateSim({ data: { leadId, summary: transcriptSummary } });
              } catch (e) {
                console.error(e);
              }
              navigate({ to: "/simulacao/resultado" });
            }}
          />
        )}

        {step !== "chat" && (
          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={goBack} disabled={stepIdx === 0 || submitting}>
              <ArrowLeft className="mr-1 size-4" /> Voltar
            </Button>
            {step === "lead" ? (
              <Button onClick={submitLead} disabled={submitting}>
                {submitting ? "Preparando Lucas..." : "Iniciar simulação"} <ArrowRight className="ml-1 size-4" />
              </Button>
            ) : (
              <Button onClick={goNext} disabled={!canNext}>
                Avançar <ArrowRight className="ml-1 size-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold md:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function Grid({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center justify-between rounded-xl border bg-card/60 p-4 text-left transition",
              on ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50",
            )}
          >
            <span className="font-medium">{o.label}</span>
            {on && <Check className="size-4 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

function MultiGrid({
  options,
  values,
  onToggle,
}: {
  options: { value: string; label: string }[];
  values: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={cn(
              "flex items-center justify-between rounded-xl border bg-card/60 p-4 text-left transition",
              on ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50",
            )}
          >
            <span className="font-medium">{o.label}</span>
            {on && <Check className="size-4 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}



const MIN_USER_TURNS = 4;
const MAX_USER_TURNS = 6;

function SimulationChat({
  leadId,
  diagnostic,
  onFinish,
}: {
  leadId: string;
  diagnostic: LeadDiagnostic;
  onFinish: (summary: string) => void;
}) {
  const transportRef = useRef<DefaultChatTransport<UIMessage> | null>(null);
  if (!transportRef.current) {
    transportRef.current = new DefaultChatTransport({
      api: "/api/public/simulation-chat",
      body: { diagnostic, leadId },
    });
  }
  const { messages, sendMessage, status } = useChat({
    id: `sim_${leadId}`,
    transport: transportRef.current,
    onError: (e) => toast.error(e.message || "Erro na simulação"),
  });
  const [input, setInput] = useState("");
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const kickedOff = useRef(false);

  // Kick off with a synthetic user "hi" so Lucas opens the scene.
  useEffect(() => {
    if (kickedOff.current) return;
    kickedOff.current = true;
    void sendMessage({ text: "Hi! Let's start." });
  }, [sendMessage]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (status === "ready") inputRef.current?.focus();
  }, [status]);

  const userTurns = messages.filter((m) => m.role === "user").length - 1; // subtract the synthetic kickoff
  const canFinish = userTurns >= MIN_USER_TURNS;
  const forceFinish = userTurns >= MAX_USER_TURNS;
  const busy = status === "submitted" || status === "streaming";

  const textOf = (m: UIMessage) =>
    m.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();

  function finish() {
    const transcript = messages
      .filter((m) => textOf(m).length > 0)
      .map((m) => `${m.role === "user" ? diagnostic.name || "User" : "Lucas"}: ${textOf(m)}`)
      .join("\n");
    onFinish(transcript.slice(0, 4000));
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-bold">F</span>
          <div>
            <p className="text-sm font-semibold">Simulação com Lucas</p>
            <p className="text-xs text-muted-foreground">
              {userTurns < MIN_USER_TURNS
                ? `Turno ${Math.max(userTurns, 0)}/${MIN_USER_TURNS} para gerar seu mapa`
                : "Você já pode encerrar quando quiser"}
            </p>
          </div>
        </div>
        {canFinish && (
          <Button size="sm" variant="secondary" onClick={finish}>
            Ver meu Mapa de Oportunidades <ArrowRight className="ml-1 size-4" />
          </Button>
        )}
      </div>

      <div className="max-h-[55vh] space-y-3 overflow-y-auto rounded-xl bg-background/40 p-3">
        {messages
          .filter((m, i) => !(i === 0 && m.role === "user")) // hide synthetic kickoff
          .map((m) => {
            const text = textOf(m);
            if (!text) return null;
            const mine = m.role === "user";
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-card border border-border",
                  )}
                >
                  {text}
                </div>
              </div>
            );
          })}
        {busy && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
              <MessageCircle className="mr-1 inline size-3 animate-pulse" /> Lucas está pensando...
            </div>
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {!forceFinish ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = input.trim();
            if (!t || busy) return;
            void sendMessage({ text: t });
            setInput("");
          }}
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Responda em inglês..."
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !input.trim()}>Enviar</Button>
        </form>
      ) : (
        <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
          Simulação concluída. Vamos preparar seu Mapa de Oportunidades.
          <div className="mt-2">
            <Button onClick={finish}>Ver meu Mapa de Oportunidades <ArrowRight className="ml-1 size-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
