import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getOrCreateTodayTraining, submitTrainingAnswer, completeTraining } from "@/lib/training.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowRight, Check, Loader2, MessageCircle, RotateCcw, Trophy, X, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/practice/today")({
  component: TrainingPlayer,
});

type Item = {
  id: string;
  exercise_type: "fill_blank" | "order_words" | "translate" | "natural_choice" | "open_response" | "vocab_choice" | "fix_error";
  prompt: string;
  instructions: string | null;
  options: string[] | null;
  correct_answer: string | null;
  translation_pt: string | null;
  explanation_pt: string | null;
  hint: string | null;
  completed: boolean;
  attempts: number;
  user_answer: string | null;
  display_order: number;
  source_type: string;
};

type SessionRow = {
  id: string;
  status: "ready" | "in_progress" | "completed";
  total_items: number;
  completed_items: number;
  correct_items: number;
};

function TrainingPlayer() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const load = useServerFn(getOrCreateTodayTraining);
  const submit = useServerFn(submitTrainingAnswer);
  const complete = useServerFn(completeTraining);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState<null | {
    verdict: "correct" | "close" | "wrong";
    feedback_pt: string | null;
    correct_answer: string | null;
    explanation_pt: string | null;
    translation_pt: string | null;
    revealed: boolean;
    completed: boolean;
  }>(null);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ xp_earned: number; streak_days: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const tz = new Date().getTimezoneOffset();
    load({ data: { desired: 7, tzOffsetMinutes: tz } })
      .then((res) => {
        if (!alive) return;
        setSession(res.session as unknown as SessionRow);
        setItems((res.items ?? []) as unknown as Item[]);
        // resume: first non-completed
        const firstOpen = (res.items ?? []).findIndex((i: { completed: boolean }) => !i.completed);
        setIdx(firstOpen === -1 ? (res.items ?? []).length - 1 : firstOpen);
        if ((res.session as unknown as SessionRow)?.status === "completed") {
          setDone(true);
        }
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load]);

  const current = items[idx];

  async function onSubmit() {
    if (!current || submitting) return;
    const val = answer.trim();
    if (val.length === 0) return;
    setSubmitting(true);
    try {
      const res = await submit({ data: { itemId: current.id, answer: val } }) as {
        verdict: "correct" | "close" | "wrong";
        feedback_pt?: string | null;
        correct_answer?: string | null;
        explanation_pt?: string | null;
        translation_pt?: string | null;
        revealed?: boolean;
        completed?: boolean;
        attempts?: number;
      };
      setFeedback({
        verdict: res.verdict,
        feedback_pt: res.feedback_pt ?? null,
        correct_answer: res.correct_answer ?? null,
        explanation_pt: res.explanation_pt ?? null,
        translation_pt: res.translation_pt ?? null,
        revealed: !!res.revealed,
        completed: !!res.completed,
      });
      // Local update
      setItems((prev) =>
        prev.map((it, i) =>
          i === idx
            ? { ...it, attempts: res.attempts ?? (it.attempts + 1), user_answer: val, completed: !!res.completed }
            : it,
        ),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function nextItem() {
    setFeedback(null);
    setAnswer("");
    if (idx + 1 < items.length) {
      setIdx(idx + 1);
      return;
    }
    // finish
    if (!session) return;
    try {
      const r = await complete({ data: { sessionId: session.id } });
      setResult({ xp_earned: r.xp_earned ?? 0, streak_days: r.streak_days ?? 0 });
      setDone(true);
      qc.invalidateQueries({ queryKey: ["today-training"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function retry() {
    setFeedback(null);
    setAnswer("");
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-24 text-muted-foreground">
        <Loader2 className="mb-2 size-6 animate-spin" />
        Preparando seu treino de hoje…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" onClick={() => location.reload()}>Tentar de novo</Button>
      </div>
    );
  }

  if (done) {
    const correct = session?.correct_items ?? items.filter((i) => (i.user_answer ?? "") && i.completed).length;
    return (
      <div className="mx-auto max-w-md py-12 text-center pb-24">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
          <Trophy className="size-8" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold">Treino concluído!</h2>
        <p className="mt-2 text-muted-foreground">
          {correct} de {items.length} corretos
        </p>
        {result && (
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
        )}
        <div className="mt-8 flex flex-col gap-2">
          <Button onClick={() => navigate({ to: "/dashboard" })}>
            <MessageCircle className="mr-2 size-4" /> Conversar com Fred
          </Button>
          <Button variant="outline" onClick={() => navigate({ to: "/practice" })}>
            <Target className="mr-2 size-4" /> Ver meus pontos difíceis
          </Button>
          <Button variant="ghost" onClick={() => navigate({ to: "/dashboard" })}>
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-muted-foreground">Nenhum exercício no treino de hoje.</p>
        <Button className="mt-4" onClick={() => navigate({ to: "/practice" })}>Voltar</Button>
      </div>
    );
  }

  const total = items.length;
  const pct = ((idx) / total) * 100;

  return (
    <div className="mx-auto max-w-xl pb-32">
      <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>Exercício {idx + 1} de {total}</span>
        <span>{exerciseLabel(current.exercise_type)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
        {current.instructions && <p className="mb-3 text-xs uppercase text-muted-foreground">{current.instructions}</p>}
        <ExercisePrompt item={current} answer={answer} setAnswer={setAnswer} feedback={feedback} onSubmit={onSubmit} />

        {feedback && (
          <FeedbackPanel feedback={feedback} item={current} />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {feedback ? (
          feedback.verdict === "wrong" && !feedback.revealed && !feedback.completed ? (
            <>
              <Button variant="outline" onClick={retry}><RotateCcw className="mr-1 size-4" />Tentar de novo</Button>
              <Button onClick={nextItem}>Pular</Button>
            </>
          ) : (
            <Button className="ml-auto" onClick={nextItem}>
              {idx + 1 === total ? "Concluir treino" : "Continuar"} <ArrowRight className="ml-1 size-4" />
            </Button>
          )
        ) : (
          <Button className="ml-auto min-h-11" onClick={onSubmit} disabled={submitting || !answer.trim()}>
            {submitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Responder
          </Button>
        )}
      </div>
    </div>
  );
}

function exerciseLabel(t: string) {
  switch (t) {
    case "fill_blank": return "Completar frase";
    case "order_words": return "Montar frase";
    case "translate": return "Tradução";
    case "natural_choice": return "Mais natural";
    case "open_response": return "Resposta em contexto";
    case "vocab_choice": return "Vocabulário";
    case "fix_error": return "Corrigir erro";
    default: return "Exercício";
  }
}

function ExercisePrompt({
  item,
  answer,
  setAnswer,
  feedback,
  onSubmit,
}: {
  item: Item;
  answer: string;
  setAnswer: (v: string) => void;
  feedback: null | { verdict: string };
  onSubmit: () => void;
}) {
  const locked = !!feedback;

  if (item.exercise_type === "fill_blank" || item.exercise_type === "vocab_choice") {
    const options = item.options ?? [];
    return (
      <>
        <p className="font-display text-lg leading-relaxed md:text-xl">{item.prompt}</p>
        {item.hint && !feedback && <p className="mt-2 text-xs text-muted-foreground">Dica: {item.hint}</p>}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {options.map((opt) => {
            const isPicked = answer === opt;
            const isCorrect = feedback && item.correct_answer === opt;
            const state = !feedback
              ? isPicked ? "border-primary bg-primary/10" : ""
              : isCorrect
                ? "border-emerald-500/60 bg-emerald-500/10"
                : isPicked
                  ? "border-destructive/60 bg-destructive/10"
                  : "opacity-60";
            return (
              <button
                key={opt}
                disabled={locked}
                onClick={() => { setAnswer(opt); }}
                className={`flex min-h-11 items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left text-sm transition hover:border-primary/60 disabled:cursor-default ${state}`}
              >
                <span>{opt}</span>
                {feedback && isCorrect && <Check className="size-4 text-emerald-500" />}
                {feedback && isPicked && !isCorrect && <X className="size-4 text-destructive" />}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  if (item.exercise_type === "natural_choice") {
    const options = item.options ?? [];
    return (
      <>
        <p className="font-display text-lg leading-relaxed md:text-xl">Qual soa mais natural?</p>
        <div className="mt-4 grid gap-2">
          {options.map((opt) => {
            const isPicked = answer === opt;
            const isCorrect = feedback && item.correct_answer === opt;
            const state = !feedback
              ? isPicked ? "border-primary bg-primary/10" : ""
              : isCorrect
                ? "border-emerald-500/60 bg-emerald-500/10"
                : isPicked
                  ? "border-destructive/60 bg-destructive/10"
                  : "opacity-60";
            return (
              <button
                key={opt}
                disabled={locked}
                onClick={() => setAnswer(opt)}
                className={`min-h-11 rounded-xl border border-border bg-background px-4 py-3 text-left text-sm transition hover:border-primary/60 disabled:cursor-default ${state}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  if (item.exercise_type === "order_words") {
    return (
      <OrderWords prompt={item.prompt} answer={answer} setAnswer={setAnswer} locked={locked} />
    );
  }

  // translate / open_response / fix_error → text input
  return (
    <>
      <p className="font-display text-lg leading-relaxed md:text-xl">{item.prompt}</p>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !locked) { e.preventDefault(); onSubmit(); } }}
        disabled={locked}
        placeholder="Escreva sua resposta em inglês…"
        className="mt-4 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary"
      />
    </>
  );
}

function OrderWords({ prompt, answer, setAnswer, locked }: { prompt: string; answer: string; setAnswer: (v: string) => void; locked: boolean }) {
  const bank = useMemo(() =>
    prompt.split(/\s*\/\s*/).map((w, i) => ({ id: `${i}-${w}`, word: w })), [prompt]);
  const selectedTokens = useMemo(() => (answer ? answer.split(" ").filter(Boolean) : []), [answer]);
  const available = useMemo(() => {
    const used = new Map<string, number>();
    for (const t of selectedTokens) used.set(t, (used.get(t) ?? 0) + 1);
    return bank.filter((b) => {
      const rem = used.get(b.word) ?? 0;
      if (rem > 0) {
        used.set(b.word, rem - 1);
        return false;
      }
      return true;
    });
  }, [bank, selectedTokens]);

  function add(word: string) {
    if (locked) return;
    setAnswer((answer ? answer + " " : "") + word);
  }
  function clear() {
    if (locked) return;
    setAnswer("");
  }
  return (
    <>
      <p className="font-display text-base text-muted-foreground">Coloque as palavras na ordem certa.</p>
      <div className="mt-3 min-h-14 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm">
        {answer || <span className="text-muted-foreground">Toque nas palavras abaixo…</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {available.map((b) => (
          <button
            key={b.id}
            disabled={locked}
            onClick={() => add(b.word)}
            className="min-h-11 rounded-full border border-border bg-card px-4 py-1.5 text-sm hover:border-primary/60 disabled:opacity-50"
          >
            {b.word}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={locked || !answer}
        onClick={clear}
        className="mt-3 text-xs text-muted-foreground underline disabled:opacity-40"
      >
        Limpar
      </button>
    </>
  );
}

function FeedbackPanel({ feedback, item }: { feedback: NonNullable<Parameters<typeof ExercisePrompt>[0]["feedback"]> & { feedback_pt: string | null; correct_answer: string | null; explanation_pt: string | null; translation_pt: string | null; revealed: boolean; completed: boolean }; item: Item }) {
  const label =
    feedback.verdict === "correct" ? "Certo!"
    : feedback.verdict === "close" ? "Quase lá"
    : "Ainda não";
  const tone =
    feedback.verdict === "correct" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
    : feedback.verdict === "close" ? "border-amber-500/40 bg-amber-500/10"
    : "border-destructive/40 bg-destructive/10";
  return (
    <div className={`mt-5 rounded-xl border p-4 text-sm ${tone}`}>
      <p className="font-medium">{label}</p>
      {feedback.feedback_pt && <p className="mt-1 text-muted-foreground">{feedback.feedback_pt}</p>}
      {(feedback.revealed || feedback.verdict === "correct" || feedback.verdict === "close") && feedback.correct_answer && (
        <p className="mt-2"><span className="text-muted-foreground">Resposta:</span> <span className="font-medium">{feedback.correct_answer}</span></p>
      )}
      {feedback.translation_pt && <p className="mt-1 text-xs text-muted-foreground">PT: {feedback.translation_pt}</p>}
      {feedback.explanation_pt && <p className="mt-1 text-xs text-muted-foreground">{feedback.explanation_pt}</p>}
      {!feedback.revealed && feedback.verdict === "wrong" && !feedback.completed && item.hint && (
        <p className="mt-2 text-xs text-muted-foreground">Dica: {item.hint}</p>
      )}
    </div>
  );
}
