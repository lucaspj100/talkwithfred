import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTodayTrainingSummary, getFocusPoints, listMyVocabulary } from "@/lib/training.functions";
import { getMyStats } from "@/lib/learning.functions";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, ClipboardCheck, Flame, History, Infinity as InfinityIcon, Layers, ListChecks, PenLine, Shuffle, Sparkles, Target, Timer, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/practice/")({
  loader: async () => {
    const [stats, today, focus, vocab] = await Promise.all([
      getMyStats(),
      getTodayTrainingSummary().catch(() => null),
      getFocusPoints().catch(() => []),
      listMyVocabulary({ data: { limit: 5 } }).catch(() => []),
    ]);
    return { stats, today, focus, vocab };
  },
  component: TrainingHome,
});

function TrainingHome() {
  const initial = Route.useLoaderData();
  const navigate = useNavigate();
  const getToday = useServerFn(getTodayTrainingSummary);
  const { data: today } = useQuery({
    queryKey: ["today-training"],
    queryFn: () => getToday(),
    initialData: initial.today,
    staleTime: 5_000,
  });

  const { stats, focus, vocab } = initial;

  const total = today?.total_items ?? 0;
  const completed = today?.completed_items ?? 0;
  const status = today?.status ?? null;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const cta =
    status === "completed"
      ? "Treino de hoje concluído"
      : status === "in_progress"
        ? "Continuar treino"
        : "Começar treino";

  return (
    <div className="pb-24 md:pb-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold md:text-4xl">Treinos</h1>
        <p className="mt-2 text-muted-foreground">
          Pratique seus pontos mais importantes em poucos minutos.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<Zap className="size-4" />} label="XP" value={stats.xp} />
        <StatCard icon={<Flame className="size-4" />} label="Streak" value={`${stats.streak_days} dia${stats.streak_days === 1 ? "" : "s"}`} />
        <StatCard icon={<Sparkles className="size-4" />} label="Recorde" value={`${stats.longest_streak} dia${stats.longest_streak === 1 ? "" : "s"}`} />
      </div>

      {/* Today's training */}
      <section className="mt-8 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-6">
        <p className="text-xs uppercase text-primary">Treino de hoje</p>
        {status === "completed" ? (
          <>
            <h2 className="mt-1 font-display text-2xl font-bold">Você já concluiu o treino de hoje 🎉</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {completed} de {total} exercícios · {today?.correct_items ?? 0} acertos
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => navigate({ to: "/practice/today" })}>Ver resultado</Button>
              <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
                Voltar ao início
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mt-1 font-display text-2xl font-bold">
              {total > 0 ? `${total} exercícios · ~${today?.estimated_minutes ?? 5} min` : "Seu treino personalizado está pronto"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {total > 0 ? "Conteúdo baseado nas suas conversas com Fred e reforço geral." : "Vamos montar um treino do seu jeito quando você começar."}
            </p>
            {status === "in_progress" && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{completed} de {total} concluídos</span>
                  <span>{pct}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="lg" onClick={() => navigate({ to: "/practice/today" })}>
                {cta} <ArrowRight className="ml-1 size-4" />
              </Button>
            </div>
          </>
        )}
      </section>

      {/* Focus points */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold flex items-center gap-2"><Target className="size-5 text-primary" /> Pontos para reforçar</h2>
        </div>
        {focus.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Conforme você conversar com Fred, os pontos que precisam de reforço aparecem aqui.
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {focus.map((f: typeof focus[number]) => {
              const errors = f.incorrect_count ?? 0;
              const level = Math.max(0, Math.min(5, f.mastery_level ?? 0));
              return (
                <li key={f.id} className="rounded-2xl border border-border bg-card/40 p-3">
                  <p className="line-through text-muted-foreground text-xs">{f.original}</p>
                  {f.correction && <p className="text-sm font-medium">{f.correction}</p>}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1" aria-label={`Domínio nível ${level} de 5`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={`size-1.5 rounded-full ${i < level ? "bg-primary" : "bg-muted"}`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {errors} {errors === 1 ? "erro" : "erros"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Vocabulary preview */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold flex items-center gap-2"><BookOpen className="size-5 text-primary" /> Meu vocabulário</h2>
          <Link to="/practice/vocabulario" className="text-sm text-primary hover:underline">Ver tudo</Link>
        </div>
        {vocab.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Palavras novas que Fred usa nas conversas aparecem aqui.
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40">
            {vocab.map((v: typeof vocab[number]) => (
              <li key={v.id} className="p-4">
                <p className="font-medium">{v.original}</p>
                {v.explanation_pt && <p className="text-xs text-muted-foreground">{v.explanation_pt}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Prática Livre */}
      <section className="mt-10">
        <div className="mb-3">
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <InfinityIcon className="size-5 text-primary" /> Continue praticando
          </h2>
          <p className="text-xs text-muted-foreground">Prática livre e ilimitada — do jeito que você quiser.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard to="/practice/livre" search={{ mode: "fill_blank" as const }} icon={<PenLine className="size-5" />} title="Completar frases" desc="Escolha a palavra que falta." />
          <ModeCard to="/practice/livre" search={{ mode: "choice" as const }} icon={<ListChecks className="size-5" />} title="Múltipla escolha" desc="Gramática, vocabulário e contexto." />
          <ModeCard to="/practice/livre" search={{ mode: "correct_error" as const }} icon={<Shuffle className="size-5" />} title="Corrigir erros" desc="Ache o erro na frase." />
          <ModeCard to="/practice/livre" search={{ mode: "my_errors" as const }} icon={<Target className="size-5" />} title="Meus erros" desc="Reveja o que você errou com Fred." />
          <ModeCard to="/practice/livre" search={{ mode: "quick_challenge" as const }} icon={<Timer className="size-5" />} title="Desafio rápido" desc="60 segundos, no ritmo!" />
          <ModeCard to="/practice/livre" search={{ mode: "infinite" as const }} icon={<Layers className="size-5" />} title="Modo infinito" desc="Sem tempo, sem limite." />
        </div>
      </section>


      {/* Secondary actions */}
      <section className="mt-8 grid gap-3 md:grid-cols-2">
        <Link to="/practice/historico" className="rounded-2xl border border-border bg-card/60 p-4 hover:border-primary/60">
          <div className="flex items-center gap-2 text-primary"><History className="size-5" /><span className="font-medium">Histórico de treinos</span></div>
          <p className="mt-1 text-xs text-muted-foreground">Veja seus treinos anteriores.</p>
        </Link>
        <Link to="/revisoes" className="rounded-2xl border border-border bg-card/60 p-4 hover:border-primary/60">
          <div className="flex items-center gap-2 text-primary"><ClipboardCheck className="size-5" /><span className="font-medium">Minhas revisões</span></div>
          <p className="mt-1 text-xs text-muted-foreground">Revise pontos específicos das conversas.</p>
        </Link>
      </section>
    </div>
  );
}

function ModeCard({
  to,
  search,
  icon,
  title,
  desc,
}: {
  to: string;
  search: Record<string, string>;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      search={search}
      className="group rounded-2xl border border-border bg-card/60 p-4 transition hover:border-primary/60 hover:bg-card"
    >
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="font-medium text-foreground">{title}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary opacity-0 transition group-hover:opacity-100">
        Começar <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">{icon}{label}</div>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

