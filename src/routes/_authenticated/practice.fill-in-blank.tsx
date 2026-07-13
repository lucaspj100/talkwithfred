import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { generateFillBlank, submitPracticeResult, type FillBlankItem } from "@/lib/learning.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, X, Loader2, MessageCircle, RotateCcw, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/practice/fill-in-blank")({
  component: FillInBlankPage,
});

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function FillInBlankPage() {
  const navigate = useNavigate();
  const gen = useServerFn(generateFillBlank);
  const submit = useServerFn(submitPracticeResult);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FillBlankItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ xp_earned: number; xp: number; streak_days: number } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    gen({ data: { count: 5 } })
      .then((rows) => { if (alive) setItems(rows); })
      .catch((e) => { if (alive) toast.error((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [gen]);

  const current = items[idx];
  const shuffledOptions = useMemo(() => (current ? shuffle(current.options) : []), [current]);

  function pick(opt: string) {
    if (selected) return;
    setSelected(opt);
    if (opt === current.answer) setCorrectCount((c) => c + 1);
  }

  async function next() {
    if (idx + 1 < items.length) {
      setIdx(idx + 1);
      setSelected(null);
      return;
    }
    // finish
    try {
      const r = await submit({ data: { activity: "fill_in_blank", total: items.length, correct: correctCount } });
      setResult({ xp_earned: r.xp_earned, xp: r.xp, streak_days: r.streak_days });
    } catch (e) {
      toast.error((e as Error).message);
    }
    setDone(true);
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-20 text-muted-foreground">
        <Loader2 className="mb-2 size-6 animate-spin" />
        Gerando exercícios para você...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="grid place-items-center py-20 text-center">
        <p className="text-muted-foreground">Não consegui gerar exercícios agora.</p>
        <Button className="mt-4" onClick={() => location.reload()}>Tentar de novo</Button>
      </div>
    );
  }

  if (done && result) {
    const accuracy = Math.round((correctCount / items.length) * 100);
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
          <Trophy className="size-8" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold">Treino concluído!</h2>
        <p className="mt-2 text-muted-foreground">{correctCount} de {items.length} corretos ({accuracy}%)</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <p className="text-xs uppercase text-muted-foreground">XP ganho</p>
            <p className="font-display text-2xl font-bold text-primary">+{result.xp_earned}</p>
          </div>
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <p className="text-xs uppercase text-muted-foreground">Streak</p>
            <p className="font-display text-2xl font-bold">{result.streak_days} 🔥</p>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-2">
          <Button onClick={() => location.reload()}>
            <RotateCcw className="mr-2 size-4" /> Continuar praticando
          </Button>
          <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
            <MessageCircle className="mr-2 size-4" /> Conversar com Lucas
          </Button>
          <Link to="/practice" className="text-sm text-muted-foreground hover:text-foreground">Voltar ao treino</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>Completar frase</span>
        <span>{idx + 1} / {items.length}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${((idx) / items.length) * 100}%` }} />
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card/60 p-6">
        <p className="font-display text-xl leading-relaxed md:text-2xl">
          {renderSentence(current.sentence, selected, current.answer)}
        </p>
        {current.hint && !selected && (
          <p className="mt-3 text-xs text-muted-foreground">Dica: {current.hint}</p>
        )}

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {shuffledOptions.map((opt) => {
            const isAnswer = opt === current.answer;
            const isPicked = opt === selected;
            const state = !selected ? "" : isAnswer ? "border-emerald-500/60 bg-emerald-500/10" : isPicked ? "border-destructive/60 bg-destructive/10" : "opacity-60";
            return (
              <button
                key={opt}
                disabled={!!selected}
                onClick={() => pick(opt)}
                className={`flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left text-sm transition hover:border-primary/60 disabled:cursor-default ${state}`}
              >
                <span>{opt}</span>
                {selected && isAnswer && <Check className="size-4 text-emerald-500" />}
                {selected && isPicked && !isAnswer && <X className="size-4 text-destructive" />}
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="mt-5 rounded-xl bg-muted/40 p-4 text-sm">
            <p className="font-medium">
              {selected === current.answer ? "Certo! ✅" : `Resposta certa: ${current.answer}`}
            </p>
            <p className="mt-1 text-muted-foreground">PT: {current.translation_pt}</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={next} disabled={!selected}>
          {idx + 1 === items.length ? "Finalizar" : "Próxima"}
        </Button>
      </div>
    </div>
  );
}

function renderSentence(sentence: string, selected: string | null, answer: string) {
  const parts = sentence.split("____");
  const fill = selected ?? "_____";
  const isRight = selected === answer;
  return (
    <>
      {parts[0]}
      <span className={`mx-1 inline-block min-w-[3ch] rounded-md px-2 py-0.5 font-semibold ${selected ? (isRight ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-destructive/15 text-destructive") : "bg-primary/10 text-primary"}`}>
        {fill}
      </span>
      {parts[1]}
    </>
  );
}
