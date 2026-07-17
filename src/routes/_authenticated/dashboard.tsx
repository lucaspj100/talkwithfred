import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, updateSpeakingSpeed } from "@/lib/profile.functions";
import { listConversations, createConversation } from "@/lib/conversations.functions";
import { getMyStats } from "@/lib/learning.functions";
import { getPendingReviewsSummary } from "@/lib/reviews.functions";
import { MODES, type Mode } from "@/lib/fred-prompt";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LogOut, MessageCircle, ShieldAlert, ArrowRight, Mic, ClipboardCheck, Flame, Zap, Target, Pencil, Sparkles, ChevronRight, X, CreditCard, User as UserIcon, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FredBrand } from "@/components/FredBrand";
import { TalkingAvatar } from "@/components/fred/TalkingAvatar";
import { SubscriptionSummaryCard } from "@/components/subscription/SubscriptionSummaryCard";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  labelGoal,
  labelArea,
  labelSituation,
  labelLevel,
  labelPracticeGoal,
} from "@/lib/onboarding-options";

export const Route = createFileRoute("/_authenticated/dashboard")({
  loader: async () => {
    const me = await getMyProfile();
    if (!me.userProfile) throw redirect({ to: "/onboarding" });
    const [convs, stats, reviews] = await Promise.all([
      listConversations(),
      getMyStats(),
      getPendingReviewsSummary().catch(() => ({ count: 0, latest: null })),
    ]);
    return { me, convs, stats, reviews };
  },
  component: Dashboard,
});

const LABEL: Record<string, string> = {
  beginner: "Iniciante", basic: "Básico", intermediate: "Intermediário", advanced: "Avançado",
};

function Dashboard() {
  const { me, convs, stats, reviews } = Route.useLoaderData();
  const navigate = useNavigate();
  const create = useServerFn(createConversation);
  const [picking, setPicking] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customTopic, setCustomTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const customInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (picking && customMode) {
      setTimeout(() => customInputRef.current?.focus(), 60);
    }
  }, [picking, customMode]);

  function closePicker() {
    setPicking(false);
    setCustomMode(false);
    setCustomTopic("");
  }

  async function startChat(mode: Mode) {
    if (creating) return;
    setCreating(true);
    try {
      const { id } = await create({ data: { mode } });
      closePicker();
      navigate({ to: "/chat/$conversationId", params: { conversationId: id } });
    } catch (e) {
      toast.error((e as Error).message);
      setCreating(false);
    }
  }

  async function startCustomChat() {
    const topic = customTopic.trim();
    if (topic.length < 3 || creating) return;
    setCreating(true);
    try {
      const { id } = await create({ data: { mode: "custom", customTopic: topic } });
      closePicker();
      navigate({ to: "/chat/$conversationId", params: { conversationId: id } });
    } catch (e) {
      toast.error((e as Error).message);
      setCreating(false);
    }
  }

  function handleModeClick(mode: Mode) {
    if (mode === "custom") {
      setCustomMode(true);
      return;
    }
    startChat(mode);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between gap-3">
        <FredBrand linkTo="/dashboard" />
        <div className="flex items-center gap-2">
          {me.isAdmin && (
            <Link to="/admin" className="hidden md:inline-flex"><Button variant="ghost" size="sm"><ShieldAlert className="mr-1 size-4" />Administração</Button></Link>
          )}
          <Link to="/assinatura" className="hidden md:inline-flex"><Button variant="ghost" size="sm"><CreditCard className="mr-1 size-4" />Minha assinatura</Button></Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menu do usuário" className="rounded-full">
                <div className="grid size-8 place-items-center rounded-full bg-primary/15 text-primary">
                  <UserIcon className="size-4" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link to="/assinatura"><CreditCard className="mr-2 size-4" />Minha assinatura</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings/onboarding"><UserIcon className="mr-2 size-4" />Meu perfil</Link>
              </DropdownMenuItem>
              {me.isAdmin && (
                <DropdownMenuItem asChild>
                  <Link to="/admin"><ShieldAlert className="mr-2 size-4" />Administração</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 size-4" />Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr,auto] md:items-center">
        <div>
          <h1 className="font-display text-3xl font-bold md:text-4xl">
            Olá, {me.profile?.name || "amigo"}.
          </h1>
          <p className="mt-2 text-muted-foreground">
            Escolha como quer praticar inglês hoje.
          </p>
        </div>
        <div className="justify-self-end">
          <TalkingAvatar state="idle" size="small" />
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat icon={<Zap className="size-4" />} label="XP" value={stats.xp} />
        <Stat icon={<Flame className="size-4" />} label="Streak" value={`${stats.streak_days} dia${stats.streak_days === 1 ? "" : "s"}`} />
        <Stat icon={<Target className="size-4" />} label="Nível" value={LABEL[me.userProfile!.english_level] ?? me.userProfile!.english_level} />
      </div>

      {/* Focus card */}
      <FocusCard profile={me.userProfile!} />
      <SpeedPreference initial={(me.userProfile!.speaking_speed_preference as string | null) ?? "level_adapted"} />

      {/* Two main modes */}
      <h2 className="mt-10 font-display text-xl font-bold">Como você quer praticar?</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ModeCard
          icon={<Mic className="size-6" />}
          tone="primary"
          title="Conversar com Fred"
          description="Fale ou digite em inglês com seu parceiro de conversação."
          cta="Escolher tema da conversa"
          onClick={() => setPicking(true)}
        />
        <ModeCard
          icon={<ClipboardCheck className="size-6" />}
          tone="accent"
          title="Praticar sem falar"
          description="Faça exercícios rápidos quando estiver no metrô, ônibus ou sem poder falar."
          cta="Começar treino"
          onClick={() => navigate({ to: "/practice" })}
        />
      </div>

      {/* Mode picker modal */}
      <ModePickerDialog
        open={picking}
        onOpenChange={(o: boolean) => { if (!o) closePicker(); else setPicking(true); }}
        customMode={customMode}
        creating={creating}
        customTopic={customTopic}
        setCustomTopic={setCustomTopic}
        onSelectMode={handleModeClick}
        onBackFromCustom={() => { setCustomMode(false); setCustomTopic(""); }}
        onStartCustom={startCustomChat}
        customInputRef={customInputRef}
      />


      {/* Daily mission */}
      <div className="mt-6 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-primary">Missão de hoje</p>
            <p className="mt-1 font-display text-lg font-semibold">
              {stats.last_practice_date === new Date().toISOString().slice(0, 10)
                ? `Streak ativo! ${stats.streak_days} dia${stats.streak_days === 1 ? "" : "s"} 🔥`
                : "Complete um treino ou converse com Fred para manter seu streak."}
            </p>
          </div>
          <Link to="/practice">
            <Button size="sm" variant="secondary">Ver missão <ArrowRight className="ml-1 size-3" /></Button>
          </Link>
        </div>
      </div>

      <SubscriptionSummaryCard />

      {reviews.count > 0 && reviews.latest && (
        <ReviewShortcut latest={reviews.latest} count={reviews.count} />
      )}


      <h2 className="mt-10 font-display text-xl font-bold">Suas últimas conversas</h2>
      <div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40">
        {convs.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">Nenhuma conversa ainda. Inicie uma conversa acima.</p>
        )}
        {convs.slice(0, 6).map((c: typeof convs[number]) => (
          <Link
            key={c.id}
            to="/chat/$conversationId"
            params={{ conversationId: c.id }}
            className="flex items-center justify-between px-5 py-3 hover:bg-accent/30"
          >
            <div>
              <p className="font-medium">{c.title}</p>
              <p className="text-xs text-muted-foreground">
                {MODES.find((m) => m.id === c.mode)?.label ?? c.mode} · {new Date(c.updated_at).toLocaleString("pt-BR")}
              </p>
            </div>
            <MessageCircle className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">{icon}{label}</div>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}

type SpeedValue = "slower" | "level_adapted" | "natural";
const SPEED_OPTIONS: { value: SpeedValue; label: string; hint: string }[] = [
  { value: "slower", label: "Mais devagar", hint: "Fred fala mais devagar que o normal" },
  { value: "level_adapted", label: "Adaptada ao meu nível", hint: "Padrão — Fred ajusta pelo seu nível" },
  { value: "natural", label: "Natural", hint: "Ritmo natural de conversa" },
];

function SpeedPreference({ initial }: { initial: string }) {
  const [value, setValue] = useState<SpeedValue>(
    (["slower", "level_adapted", "natural"] as const).includes(initial as SpeedValue)
      ? (initial as SpeedValue)
      : "level_adapted",
  );
  const [saving, setSaving] = useState(false);
  const save = useServerFn(updateSpeakingSpeed);

  async function onChange(v: SpeedValue) {
    const prev = value;
    setValue(v);
    setSaving(true);
    try {
      await save({ data: { speaking_speed_preference: v } });
      toast.success("Preferência de fala atualizada");
    } catch (e) {
      setValue(prev);
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const current = SPEED_OPTIONS.find((o) => o.value === value)!;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase text-muted-foreground">Velocidade da fala do Fred</p>
          <p className="text-xs text-muted-foreground">{current.hint}</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-background/60 p-1">
          {SPEED_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              disabled={saving || value === o.value}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                value === o.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModeCard({ icon, title, description, cta, onClick, tone }: {
  icon: React.ReactNode; title: string; description: string; cta: string; onClick: () => void; tone: "primary" | "accent";
}) {
  const ring = tone === "primary" ? "from-primary/20 to-transparent border-primary/40" : "from-accent/30 to-transparent border-accent/50";
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col rounded-2xl border bg-gradient-to-br p-6 text-left transition hover:scale-[1.01] ${ring}`}
    >
      <div className="grid size-12 place-items-center rounded-xl bg-background/60 text-primary">{icon}</div>
      <h3 className="mt-4 font-display text-xl font-bold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <span className="mt-6 inline-flex items-center text-sm font-medium text-primary">
        {cta} <ArrowRight className="ml-1 size-4 transition group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function FocusCard({ profile }: { profile: NonNullable<ReturnType<typeof Route.useLoaderData>["me"]["userProfile"]> }) {
  const completed = profile.onboarding_completed;
  const primaryGoal = profile.primary_english_goal ?? profile.main_goal ?? null;
  const goals = (profile.english_goals as string[] | null) ?? [];
  const secondary = goals.filter((g) => g !== primaryGoal);
  const primaryArea = profile.primary_professional_area as string | null;
  const customArea = profile.custom_professional_area as string | null;
  const situations = ((profile.preferred_situations as string[] | null) ?? []).slice(0, 4);
  const practiceGoal = profile.practice_goal as string | null;

  if (!completed) {
    return (
      <div className="mt-6 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 to-transparent p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase text-primary">
              <Sparkles className="size-3.5" /> Atualize seu foco com Fred
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Conte para Fred seus objetivos atuais para personalizar conversas e treinos.
            </p>
          </div>
          <Link to="/settings/onboarding">
            <Button size="sm">Atualizar agora</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase text-muted-foreground">Seu foco atual</p>
          <div className="mt-2 grid gap-1 text-sm">
            {primaryGoal && (
              <p><span className="text-muted-foreground">Objetivo:</span> <span className="font-medium">{labelGoal(primaryGoal)}</span></p>
            )}
            {primaryArea && (
              <p><span className="text-muted-foreground">Área:</span> <span className="font-medium">{labelArea(primaryArea, customArea)}</span></p>
            )}
            {situations.length > 0 && (
              <p className="truncate"><span className="text-muted-foreground">Situações:</span> <span className="font-medium">{situations.map(labelSituation).join(", ")}</span></p>
            )}
            {secondary.length > 0 && (
              <p className="truncate text-xs text-muted-foreground">Também: {secondary.map(labelGoal).join(", ")}</p>
            )}
            {practiceGoal && (
              <p className="text-xs text-muted-foreground">Meta: {labelPracticeGoal(practiceGoal)}</p>
            )}
          </div>
        </div>
        <Link to="/settings/onboarding">
          <Button size="sm" variant="outline"><Pencil className="mr-1 size-3.5" />Editar foco</Button>
        </Link>
      </div>
    </div>
  );
}

function ModePickerDialog({
  open, onOpenChange, customMode, creating, customTopic, setCustomTopic,
  onSelectMode, onBackFromCustom, onStartCustom, customInputRef,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customMode: boolean;
  creating: boolean;
  customTopic: string;
  setCustomTopic: (v: string) => void;
  onSelectMode: (mode: Mode) => void;
  onBackFromCustom: () => void;
  onStartCustom: () => void;
  customInputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none max-h-[90vh] sm:max-h-[85vh] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-lg font-bold leading-tight">
                {customMode ? "Sobre o que você quer conversar?" : "Escolha como quer conversar"}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                {customMode ? "Escreva o tema. Você poderá mudar depois." : "Você poderá mudar o modo depois."}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Fechar"
              className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {!customMode ? (
              <ul className="flex flex-col gap-2">
                {MODES.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onSelectMode(m.id)}
                      disabled={creating}
                      className="group flex w-full items-center gap-3 rounded-xl border border-border bg-background px-4 py-4 text-left transition active:scale-[0.99] active:bg-accent/60 hover:border-primary/60 hover:bg-accent/40 disabled:opacity-60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-base font-semibold">{m.label}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>
                      </div>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col gap-3">
                <textarea
                  ref={customInputRef}
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value.slice(0, 300))}
                  maxLength={300}
                  rows={4}
                  placeholder="Ex.: tecnologia, futebol, minha profissão, uma viagem, uma reunião específica..."
                  className="block w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-primary"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{customTopic.trim().length < 3 ? "Digite ao menos 3 caracteres" : "\u00a0"}</span>
                  <span>{customTopic.length}/300</span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <Button variant="ghost" onClick={onBackFromCustom} disabled={creating}>
                    Voltar
                  </Button>
                  <Button
                    onClick={onStartCustom}
                    disabled={customTopic.trim().length < 3 || creating}
                  >
                    {creating ? "Iniciando..." : "Começar conversa"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type ReviewShortcutLatest = {
  id: string;
  conversation_id: string;
  title: string | null;
  status: string;
  total_items: number;
  completed_items: number;
  estimated_minutes: number;
  updated_at: string;
};

function ReviewShortcut({ latest, count }: { latest: ReviewShortcutLatest; count: number }) {
  const isProcessing = latest.status === "processing";
  const isFailed = latest.status === "failed";
  const isInProgress = latest.status === "in_progress";

  const badge = isProcessing
    ? "Fred está preparando sua revisão"
    : isFailed
      ? "Revisão com erro — tente novamente"
      : isInProgress
        ? "Revisão em andamento"
        : count === 1
          ? "Revisão pendente"
          : `${count} revisões pendentes`;

  const cta = isProcessing
    ? "Ver progresso"
    : isFailed
      ? "Tentar novamente"
      : isInProgress
        ? "Continuar"
        : "Revisar agora";

  const to = isProcessing || isFailed ? "/chat/$conversationId/revisao" : "/revisoes/$reviewId";
  const params = isProcessing || isFailed
    ? { conversationId: latest.conversation_id }
    : { reviewId: latest.id };

  const description = isProcessing
    ? "Vamos separar os pontos mais importantes para você praticar."
    : isFailed
      ? "Podemos tentar preparar sua revisão de novo agora."
      : `${latest.total_items} ponto${latest.total_items === 1 ? "" : "s"} · ~${latest.estimated_minutes} min`;

  const borderClass = isFailed ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5 hover:bg-primary/10";
  const iconClass = isFailed ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary";

  return (
    <Link
      to={to}
      params={params}
      className={`mt-6 flex items-center justify-between gap-3 rounded-3xl border p-5 transition ${borderClass}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
          {isProcessing ? <Loader2 className="size-5 animate-spin" /> : isFailed ? <RefreshCw className="size-5" /> : <Sparkles className="size-5" />}
        </div>
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wide ${isFailed ? "text-destructive" : "text-primary"}`}>
            {badge}
          </p>
          <p className="truncate font-medium">{latest.title || "Sua última conversa"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
        <span className="hidden sm:inline">{cta}</span>
        <ChevronRight className="size-5" />
      </div>
    </Link>
  );
}
