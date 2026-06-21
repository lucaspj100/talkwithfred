import { createFileRoute, Link } from "@tanstack/react-router";
import { getMyStats, listLearningItems } from "@/lib/learning.functions";
import { Flame, Sparkles, BookOpen, MessageSquareQuote, ClipboardCheck, ArrowRight, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/practice/")({
  loader: async () => {
    const [stats, errors, vocab] = await Promise.all([
      getMyStats(),
      listLearningItems({ data: { kind: "error", limit: 5 } }),
      listLearningItems({ data: { kind: "vocabulary", limit: 5 } }),
    ]);
    return { stats, errors, vocab };
  },
  component: PracticeIndex,
});

function PracticeIndex() {
  const { stats, errors, vocab } = Route.useLoaderData();
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold md:text-4xl">Praticar sem falar</h1>
        <p className="mt-2 text-muted-foreground">
          Treinos rápidos e silenciosos. Perfeitos para metrô, ônibus, trabalho ou intervalo.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<Zap className="size-4" />} label="XP" value={stats.xp} />
        <StatCard icon={<Flame className="size-4" />} label="Streak" value={`${stats.streak_days} dia${stats.streak_days === 1 ? "" : "s"}`} />
        <StatCard icon={<Sparkles className="size-4" />} label="Recorde" value={`${stats.longest_streak} dia${stats.longest_streak === 1 ? "" : "s"}`} />
      </div>

      <h2 className="mt-10 font-display text-xl font-bold">Atividades</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ActivityCard
          to="/practice/fill-in-blank"
          title="Completar frase"
          desc="Escolha a palavra certa para preencher a lacuna. IA monta os exercícios com base nos seus erros recentes."
          icon={<ClipboardCheck className="size-5" />}
          ready
        />
        <ActivityCard
          to="/practice"
          title="Montar frase"
          desc="Coloque as palavras na ordem certa."
          icon={<MessageSquareQuote className="size-5" />}
        />
        <ActivityCard
          to="/practice"
          title="Tradução inteligente"
          desc="Traduza do português para o inglês com feedback da IA."
          icon={<BookOpen className="size-5" />}
        />
        <ActivityCard
          to="/practice"
          title="Quiz de gramática"
          desc="Perguntas rápidas de múltipla escolha."
          icon={<Sparkles className="size-5" />}
        />
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Panel title={`Meus erros (${stats.errors_count})`} subtitle="Capturados nas conversas com Fred.">
          {errors.length === 0 ? (
            <Empty text="Sem erros registrados ainda. Converse com Fred para começarmos a capturar." />
          ) : (
            <ul className="divide-y divide-border">
              {errors.map((e: typeof errors[number]) => (
                <li key={e.id} className="py-3 text-sm">
                  <p className="line-through text-muted-foreground">{e.original}</p>
                  <p className="font-medium text-foreground">{e.correction}</p>
                  {e.explanation_pt && <p className="mt-1 text-xs text-muted-foreground">{e.explanation_pt}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`Vocabulário (${stats.vocabulary_count})`} subtitle="Palavras novas que Fred usou com você.">
          {vocab.length === 0 ? (
            <Empty text="Sem vocabulário ainda. Quanto mais conversas, mais palavras." />
          ) : (
            <ul className="divide-y divide-border">
              {vocab.map((v: typeof vocab[number]) => (
                <li key={v.id} className="py-3 text-sm">
                  <p className="font-medium">{v.original}</p>
                  {v.explanation_pt && <p className="text-xs text-muted-foreground">{v.explanation_pt}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
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

function ActivityCard({ to, title, desc, icon, ready }: { to: string; title: string; desc: string; icon: React.ReactNode; ready?: boolean }) {
  const inner = (
    <div className={`group rounded-2xl border border-border bg-card/60 p-5 text-left transition ${ready ? "hover:border-primary/60 hover:bg-card cursor-pointer" : "opacity-60"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">{icon}<p className="font-display text-base font-semibold text-foreground">{title}</p></div>
        {!ready && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">em breve</span>}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      {ready && (
        <span className="mt-3 inline-flex items-center text-xs text-primary">
          Começar <ArrowRight className="ml-1 size-3" />
        </span>
      )}
    </div>
  );
  if (!ready) return inner;
  return (
    <Link to={to} className="block">
      {inner}
    </Link>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
