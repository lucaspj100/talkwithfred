import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { listConversations, createConversation } from "@/lib/conversations.functions";
import { getMyStats } from "@/lib/learning.functions";
import { MODES, type Mode } from "@/lib/fred-prompt";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LogOut, MessageCircle, ShieldAlert, ArrowRight, Mic, ClipboardCheck, Flame, Zap, Target } from "lucide-react";
import { useState } from "react";
import fredAvatar from "@/assets/fred-avatar.jpg";

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
  work: "Trabalho", job_interview: "Entrevista", travel: "Viagem", conversation: "Conversação",
  study: "Estudo", presentation: "Apresentação", meeting: "Reunião", other: "Outro",
};

function Dashboard() {
  const { me, convs, stats } = Route.useLoaderData();
  const navigate = useNavigate();
  const create = useServerFn(createConversation);
  const [picking, setPicking] = useState(false);

  async function startChat(mode: Mode) {
    try {
      const { id } = await create({ data: { mode } });
      navigate({ to: "/chat/$conversationId", params: { conversationId: id } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">F</span>
          Talk With Fred
        </Link>
        <div className="flex items-center gap-2">
          {me.isAdmin && (
            <Link to="/admin"><Button variant="ghost" size="sm"><ShieldAlert className="mr-1 size-4" />Admin</Button></Link>
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
          <img src={fredAvatar} alt="Fred" width={1024} height={1024} loading="lazy" className="h-24 w-24 rounded-full object-cover" />
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat icon={<Zap className="size-4" />} label="XP" value={stats.xp} />
        <Stat icon={<Flame className="size-4" />} label="Streak" value={`${stats.streak_days} dia${stats.streak_days === 1 ? "" : "s"}`} />
        <Stat icon={<Target className="size-4" />} label="Nível" value={LABEL[me.userProfile!.english_level] ?? me.userProfile!.english_level} />
      </div>

      {/* Two main modes */}
      <h2 className="mt-10 font-display text-xl font-bold">Como você quer praticar?</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ModeCard
          icon={<Mic className="size-6" />}
          tone="primary"
          title="Conversar com Fred"
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

      {/* Mode picker for "Conversar com Fred" */}
      {picking && (
        <div className="mt-4 rounded-2xl border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Escolha um modo de conversa:</p>
            <button onClick={() => setPicking(false)} className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => startChat(m.id)}
                className="group rounded-xl border border-border bg-background p-4 text-left transition hover:border-primary/60"
              >
                <p className="font-display text-sm font-semibold">{m.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
              </button>
            ))}
          </div>
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
                : "Complete um treino ou converse com Fred para manter seu streak."}
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
