import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, updateSpeakingSpeed } from "@/lib/profile.functions";
import { listConversations, createConversation } from "@/lib/conversations.functions";
import { getMyStats } from "@/lib/learning.functions";
import { MODES, type Mode } from "@/lib/fred-prompt";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LogOut, MessageCircle, ShieldAlert, ArrowRight, Mic, ClipboardCheck, Flame, Zap, Target, Pencil, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import fredAvatar from "@/assets/fred-avatar.jpg";
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
    const [convs, stats] = await Promise.all([listConversations(), getMyStats()]);
    return { me, convs, stats };
  },
  component: Dashboard,
});

const LABEL: Record<string, string> = {
  beginner: "Iniciante", basic: "Básico", intermediate: "Intermediário", advanced: "Avançado",
};

function Dashboard() {
  const { me, convs, stats } = Route.useLoaderData();
  const navigate = useNavigate();
  const create = useServerFn(createConversation);
  const [picking, setPicking] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customTopic, setCustomTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const customFieldRef = useRef<HTMLDivElement | null>(null);
  const customInputRef = useRef<HTMLTextAreaElement | null>(null);

  async function startChat(mode: Mode) {
    if (creating) return;
    setCreating(true);
    try {
      const { id } = await create({ data: { mode } });
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
      navigate({ to: "/chat/$conversationId", params: { conversationId: id } });
    } catch (e) {
      toast.error((e as Error).message);
      setCreating(false);
    }
  }

  function handleModeClick(mode: Mode) {
    if (mode === "custom") {
      setCustomMode(true);
      setTimeout(() => {
        customFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        customInputRef.current?.focus();
      }, 60);
      return;
    }
    setCustomMode(false);
    startChat(mode);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <LucasBrand linkTo="/dashboard" />
        <div className="flex items-center gap-2">
          {me.isAdmin && (
            <Link to="/admin"><Button variant="ghost" size="sm"><ShieldAlert className="mr-1 size-4" />Administração</Button></Link>
          )}
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="mr-1 size-4" />Sair</Button>
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
        <div className="fred-ring h-24 w-24 justify-self-end" data-state="neutral">
          <img src={fredAvatar} alt="Lucas" width={1024} height={1024} loading="lazy" className="h-24 w-24 rounded-full object-cover" />
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
          title="Conversar com Lucas"
          description="Fale ou digite em inglês com seu parceiro de conversação."
          cta={picking ? "Escolha um modo..." : "Iniciar conversa"}
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

      {/* Mode picker for "Conversar com Lucas" */}
      {picking && (
        <div className="mt-4 rounded-2xl border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Escolha um modo de conversa:</p>
            <button
              onClick={() => { setPicking(false); setCustomMode(false); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {MODES.map((m) => {
              const active = m.id === "custom" && customMode;
              return (
                <button
                  key={m.id}
                  onClick={() => handleModeClick(m.id)}
                  disabled={creating}
                  className={`group rounded-xl border p-4 text-left transition disabled:opacity-60 ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:border-primary/60"
                  }`}
                >
                  <p className="font-display text-sm font-semibold">{m.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
                </button>
              );
            })}
          </div>

          {customMode && (
            <div ref={customFieldRef} className="mt-4 rounded-xl border border-primary/40 bg-background/70 p-4">
              <label htmlFor="custom-topic" className="block text-sm font-medium">
                Sobre o que você quer conversar?
              </label>
              <textarea
                id="custom-topic"
                ref={customInputRef}
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value.slice(0, 300))}
                maxLength={300}
                rows={3}
                placeholder="Ex.: tecnologia, futebol, minha profissão, uma viagem, uma reunião específica..."
                className="mt-2 block w-full max-w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{customTopic.trim().length < 3 ? "Digite ao menos 3 caracteres" : "\u00a0"}</span>
                <span>{customTopic.length}/300</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setCustomMode(false); setCustomTopic(""); }}
                  disabled={creating}
                >
                  Voltar
                </Button>
                <Button
                  size="sm"
                  onClick={startCustomChat}
                  disabled={customTopic.trim().length < 3 || creating}
                >
                  {creating ? "Iniciando..." : "Começar conversa"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Daily mission */}
      <div className="mt-6 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-primary">Missão de hoje</p>
            <p className="mt-1 font-display text-lg font-semibold">
              {stats.last_practice_date === new Date().toISOString().slice(0, 10)
                ? `Streak ativo! ${stats.streak_days} dia${stats.streak_days === 1 ? "" : "s"} 🔥`
                : "Complete um treino ou converse com Lucas para manter seu streak."}
            </p>
          </div>
          <Link to="/practice">
            <Button size="sm" variant="secondary">Ver missão <ArrowRight className="ml-1 size-3" /></Button>
          </Link>
        </div>
      </div>

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
  { value: "slower", label: "Mais devagar", hint: "Lucas fala mais devagar que o normal" },
  { value: "level_adapted", label: "Adaptada ao meu nível", hint: "Padrão — Lucas ajusta pelo seu nível" },
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
          <p className="text-xs uppercase text-muted-foreground">Velocidade da fala do Lucas</p>
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
              <Sparkles className="size-3.5" /> Atualize seu foco com Lucas
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Conte para Lucas seus objetivos atuais para personalizar conversas e treinos.
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
