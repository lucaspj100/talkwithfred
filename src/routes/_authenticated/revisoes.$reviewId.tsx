import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getReview,
  beginReview,
  completeReview,
  ensureItemExercises,
  submitExerciseAnswer,
  advanceItemStage,
} from "@/lib/reviews.functions";
import { humanType } from "./chat.$conversationId.revisao";
import { Button } from "@/components/ui/button";
import { FredAvatar } from "@/components/FredBrand";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Home,
  Sparkles,
  XCircle,
  AlertCircle,
  Lightbulb,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/revisoes/$reviewId")({
  component: ReviewPlayerPage,
});

type Item = {
  id: string;
  type: string;
  category: string | null;
  original_text: string | null;
  corrected_text: string | null;
  natural_text: string | null;
  explanation_pt: string | null;
  translation_pt: string | null;
  completed: boolean;
  display_order: number;
  stage: "understand" | "practice" | "apply" | "done" | string;
  exercise_type: string | null;
  exercise_prompt: string | null;
  exercise_instructions: string | null;
  exercise_options: string[] | null;
  correct_answer: string | null;
  acceptable_answers: string[] | null;
  second_exercise_type: string | null;
  second_exercise_prompt: string | null;
  second_exercise_options: string[] | null;
  second_correct_answer: string | null;
  second_acceptable_answers: string[] | null;
  user_answer_first: string | null;
  user_answer_second: string | null;
  attempts_first: number;
  attempts_second: number;
};

type Review = {
  id: string;
  status: string;
  title: string | null;
  summary: string | null;
  total_items: number;
  completed_items: number;
  estimated_minutes: number;
  started_at: string | null;
  completed_at: string | null;
};

type Verdict = "correct" | "close" | "wrong";

function ReviewPlayerPage() {
  const { reviewId } = Route.useParams();
  const navigate = useNavigate();
  const fetchReview = useServerFn(getReview);
  const begin = useServerFn(beginReview);
  const finish = useServerFn(completeReview);

  const q = useQuery({
    queryKey: ["review", reviewId],
    queryFn: () => fetchReview({ data: { reviewId } }),
  });

  const review = q.data?.review as Review | undefined;
  const items = useMemo(
    () => ((q.data?.items ?? []) as Item[]).slice().sort((a, b) => a.display_order - b.display_order),
    [q.data],
  );

  // Resume at the first non-done item.
  const startIdx = useMemo(() => {
    const i = items.findIndex((it) => !it.completed);
    return i === -1 ? items.length : i;
  }, [items]);

  const [idx, setIdx] = useState<number | null>(null);
  useEffect(() => {
    if (idx === null && items.length > 0) setIdx(startIdx);
  }, [items.length, startIdx, idx]);

  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (review && review.status === "ready") {
      begin({ data: { reviewId } }).catch(() => {});
    }
  }, [review, reviewId, begin]);

  if (q.isLoading || !review || idx === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const done = review.status === "completed" || idx >= items.length;
  const current = items[idx];

  async function goNext() {
    if (idx === null) return;
    if (idx + 1 >= items.length) {
      setFinishing(true);
      try {
        await finish({ data: { reviewId } });
        await q.refetch();
        setIdx(items.length);
      } catch {
        toast.error("Não conseguimos concluir a revisão. Tente novamente.", { duration: 6000 });
      } finally {
        setFinishing(false);
      }
    } else {
      setIdx(idx + 1);
      await q.refetch();
    }
  }

  const errorHeavy = items.filter((it) => (it.attempts_first ?? 0) >= 2 || (it.attempts_second ?? 0) >= 2);

  return (
    <div
      className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-4 py-6"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 5rem)" }}
    >
      <header className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/revisoes" })}>
          <ArrowLeft className="mr-1 size-4" /> Minhas revisões
        </Button>
        {!done && items.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Ponto {Math.min(idx + 1, items.length)} de {items.length}
          </p>
        )}
      </header>

      {!done && items.length > 0 && (
        <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full bg-primary transition-all" style={{ width: `${(idx / items.length) * 100}%` }} />
        </div>
      )}

      {!done && current && (
        <ItemPlayer
          key={current.id}
          item={current}
          onCompleted={goNext}
          onRefetch={() => q.refetch()}
        />
      )}

      {done && (
        <div className="mt-4 flex flex-col items-center rounded-3xl border border-border bg-card/50 p-6 text-center">
          <div className="fred-ring h-20 w-20" data-state="idle">
            <FredAvatar alt="Fred" className="h-20 w-20 ring-0" />
          </div>
          <CheckCircle2 className="mt-3 size-8 text-primary" />
          <h1 className="mt-3 font-display text-2xl font-bold">Revisão concluída!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Você revisou {review.total_items} ponto{review.total_items === 1 ? "" : "s"}.
          </p>

          <div className="mt-6 grid w-full grid-cols-2 gap-3 text-sm">
            <Stat label="Pontos" value={String(review.total_items)} />
            <Stat label="Tempo estimado" value={`~${review.estimated_minutes} min`} />
          </div>

          {errorHeavy.length > 0 && (
            <div className="mt-6 w-full rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-left">
              <p className="mb-2 text-xs font-semibold uppercase text-amber-500">Vale revisar novamente</p>
              <ul className="space-y-1 text-sm">
                {errorHeavy.map((it) => (
                  <li key={it.id} className="truncate">
                    • {it.category ?? humanType(it.type)}
                    {it.original_text ? ` — “${it.original_text}”` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex w-full flex-col gap-2">
            <Button size="lg" onClick={() => navigate({ to: "/dashboard" })}>
              <MessageCircle className="mr-1 size-4" /> Conversar novamente
            </Button>
            {errorHeavy.length > 0 && (
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  const first = items.findIndex((it) => it.id === errorHeavy[0].id);
                  if (first >= 0) setIdx(first);
                }}
              >
                Rever meus erros
              </Button>
            )}
            <Link to="/dashboard">
              <Button size="lg" variant="ghost" className="w-full">
                <Home className="mr-1 size-4" /> Voltar ao dashboard
              </Button>
            </Link>
          </div>
        </div>
      )}
      {finishing && (
        <div className="fixed inset-x-0 bottom-6 mx-auto w-fit rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg">
          <Loader2 className="mr-1 inline size-4 animate-spin" /> Concluindo…
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/40 p-3">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

/* ============ ItemPlayer: 3-stage flow ============ */

type SubStage = "understand" | "practice" | "apply";

function ItemPlayer({
  item,
  onCompleted,
  onRefetch,
}: {
  item: Item;
  onCompleted: () => void;
  onRefetch: () => Promise<unknown>;
}) {
  const ensure = useServerFn(ensureItemExercises);
  const submit = useServerFn(submitExerciseAnswer);
  const advance = useServerFn(advanceItemStage);

  // Initial stage: resume from item.stage if it's practice/apply and exercises exist.
  const [stage, setStage] = useState<SubStage>(() => {
    if (item.stage === "practice" && item.exercise_prompt) return "practice";
    if (item.stage === "apply" && item.second_exercise_prompt) return "apply";
    return "understand";
  });
  const [preparingExercise, setPreparingExercise] = useState(false);
  const [localItem, setLocalItem] = useState<Item>(item);

  useEffect(() => {
    setLocalItem(item);
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function goToPractice() {
    // If no exercise yet (legacy item), generate on-demand.
    if (!localItem.exercise_prompt || !localItem.correct_answer) {
      setPreparingExercise(true);
      try {
        const res = await ensure({ data: { itemId: item.id } });
        if (res.item) setLocalItem(res.item as Item);
      } catch (e) {
        toast.error((e as Error).message || "Falha ao gerar exercício.", { duration: 6000 });
        setPreparingExercise(false);
        return;
      } finally {
        setPreparingExercise(false);
      }
    }
    setStage("practice");
    advance({ data: { itemId: item.id, toStage: "practice" } }).catch(() => {});
  }

  async function onFinishPractice() {
    setStage("apply");
    advance({ data: { itemId: item.id, toStage: "apply" } }).catch(() => {});
  }

  async function onFinishApply() {
    await advance({ data: { itemId: item.id, toStage: "done" } }).catch(() => {});
    await onRefetch();
    onCompleted();
  }

  return (
    <div>
      <StageBreadcrumb stage={stage} />

      {stage === "understand" && (
        <UnderstandCard item={localItem} onPractice={goToPractice} preparing={preparingExercise} />
      )}

      {stage === "practice" && localItem.exercise_prompt && localItem.correct_answer && (
        <ExerciseCard
          key={`${localItem.id}-practice`}
          itemId={localItem.id}
          stageKey="practice"
          type={localItem.exercise_type ?? "multiple_choice"}
          promptText={localItem.exercise_prompt}
          instructions={localItem.exercise_instructions}
          options={localItem.exercise_options}
          expectedCorrect={localItem.correct_answer}
          onNext={onFinishPractice}
          submit={submit}
          category={localItem.category}
        />
      )}

      {stage === "apply" && (
        <>
          {localItem.second_exercise_prompt && localItem.second_correct_answer ? (
            <ExerciseCard
              key={`${localItem.id}-apply`}
              itemId={localItem.id}
              stageKey="apply"
              type={localItem.second_exercise_type ?? "translate"}
              promptText={localItem.second_exercise_prompt}
              instructions={"Aplique a mesma regra neste novo contexto"}
              options={localItem.second_exercise_options}
              expectedCorrect={localItem.second_correct_answer}
              onNext={onFinishApply}
              submit={submit}
              category={localItem.category}
            />
          ) : (
            <div className="rounded-3xl border border-border bg-card/50 p-6 text-center">
              <p className="text-sm text-muted-foreground">Sem aplicação adicional para este ponto.</p>
              <Button className="mt-4" onClick={onFinishApply} size="lg">
                Concluir ponto <ArrowRight className="ml-1 size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StageBreadcrumb({ stage }: { stage: SubStage }) {
  const items: { key: SubStage; label: string }[] = [
    { key: "understand", label: "Entender" },
    { key: "practice", label: "Praticar" },
    { key: "apply", label: "Aplicar" },
  ];
  const order = { understand: 0, practice: 1, apply: 2 } as const;
  const cur = order[stage];
  return (
    <ol className="mb-3 flex items-center gap-2 text-xs">
      {items.map((s, i) => {
        const done = order[s.key] < cur;
        const active = s.key === stage;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                    ? "bg-primary/20 text-primary ring-1 ring-primary"
                    : "bg-border text-muted-foreground"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>{s.label}</span>
            {i < items.length - 1 && <span className="text-muted-foreground">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

function UnderstandCard({
  item,
  onPractice,
  preparing,
}: {
  item: Item;
  onPractice: () => void;
  preparing: boolean;
}) {
  return (
    <article className="rounded-3xl border border-border bg-card/50 p-5 md:p-6">
      <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
        <Sparkles className="size-3.5" /> {humanType(item.type)}
        {item.category && <span className="text-primary/60">· {item.category}</span>}
      </div>

      {item.original_text && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Você disse</p>
          <p className="mt-1 rounded-2xl bg-destructive/5 p-3 text-sm">“{item.original_text}”</p>
        </div>
      )}

      {(item.natural_text || item.corrected_text) && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Uma forma melhor</p>
          <p className="mt-1 rounded-2xl bg-primary/10 p-3 text-sm font-medium">
            “{item.natural_text || item.corrected_text}”
          </p>
          {item.translation_pt && (
            <p className="mt-1 text-xs text-muted-foreground">🇧🇷 {item.translation_pt}</p>
          )}
        </div>
      )}

      {item.explanation_pt && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Explicação</p>
          <p className="mt-1 text-sm leading-relaxed">{item.explanation_pt}</p>
        </div>
      )}

      <div className="mt-6">
        <Button size="lg" className="w-full min-h-11" onClick={onPractice} disabled={preparing}>
          {preparing ? (
            <>
              <Loader2 className="mr-1 size-4 animate-spin" /> Preparando exercício…
            </>
          ) : (
            <>
              Praticar este ponto <ArrowRight className="ml-1 size-4" />
            </>
          )}
        </Button>
      </div>
    </article>
  );
}

function ExerciseCard({
  itemId,
  stageKey,
  type,
  promptText,
  instructions,
  options,
  expectedCorrect,
  onNext,
  submit,
  category,
}: {
  itemId: string;
  stageKey: "practice" | "apply";
  type: string;
  promptText: string;
  instructions: string | null;
  options: string[] | null;
  expectedCorrect: string;
  onNext: () => void;
  submit: ReturnType<typeof useServerFn<typeof submitExerciseAnswer>>;
  category: string | null;
}) {
  const isChoice = type === "multiple_choice" || (options && options.length > 0);
  const [answer, setAnswer] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ verdict: Verdict; feedback: string | null; attempts: number } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [hint, setHint] = useState(false);

  const canSubmit = isChoice ? !!selected : answer.trim().length > 0;

  async function onSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const value = isChoice ? (selected as string) : answer.trim();
      const res = await submit({ data: { itemId, stage: stageKey, userAnswer: value } });
      setResult({ verdict: res.verdict as Verdict, feedback: res.feedback_pt, attempts: res.attempts });
      if (res.verdict !== "correct" && res.attempts >= 2) setShowAnswer(true);
    } catch (e) {
      toast.error((e as Error).message || "Falha ao verificar resposta.", { duration: 6000 });
    } finally {
      setSubmitting(false);
    }
  }

  function tryAgain() {
    setResult(null);
    setAnswer("");
    setSelected(null);
    setHint(true);
  }

  return (
    <article className="rounded-3xl border border-border bg-card/50 p-5 md:p-6">
      <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
        <Sparkles className="size-3.5" /> {stageKey === "practice" ? "Praticar" : "Aplicar"}
        {category && <span className="text-primary/60">· {category}</span>}
      </div>

      {instructions && <p className="mt-3 text-sm text-muted-foreground">{instructions}</p>}

      <p className="mt-3 whitespace-pre-line rounded-2xl bg-background/60 p-4 text-base font-medium">
        {promptText}
      </p>

      {isChoice && options && (
        <div className="mt-4 flex flex-col gap-2">
          {options.map((opt) => {
            const active = selected === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setSelected(opt)}
                disabled={!!result && result.verdict === "correct"}
                className={`min-h-11 rounded-xl border px-4 py-3 text-left text-sm transition ${
                  active
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-border bg-background hover:border-primary/40"
                } disabled:opacity-70`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {!isChoice && (
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value.slice(0, 300))}
          disabled={!!result && result.verdict === "correct"}
          rows={3}
          placeholder="Digite sua resposta em inglês…"
          className="mt-4 block w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-primary disabled:opacity-70"
        />
      )}

      {hint && !result && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-500/90">
          <Lightbulb className="mt-0.5 size-4 shrink-0" />
          <span>Preste atenção na estrutura da forma correta que você viu na etapa anterior.</span>
        </div>
      )}

      {result && (
        <div
          className={`mt-4 rounded-2xl border p-4 text-sm ${
            result.verdict === "correct"
              ? "border-primary/40 bg-primary/10 text-foreground"
              : result.verdict === "close"
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-destructive/40 bg-destructive/5"
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {result.verdict === "correct" ? (
              <>
                <CheckCircle2 className="size-4 text-primary" /> Acertou!
              </>
            ) : result.verdict === "close" ? (
              <>
                <AlertCircle className="size-4 text-amber-500" /> Quase!
              </>
            ) : (
              <>
                <XCircle className="size-4 text-destructive" /> Precisa revisar
              </>
            )}
          </div>
          {result.feedback && <p className="mt-1 text-xs text-muted-foreground">{result.feedback}</p>}
          {showAnswer && result.verdict !== "correct" && (
            <p className="mt-2 text-xs">
              Resposta esperada: <span className="font-medium">“{expectedCorrect}”</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {!result && (
          <Button size="lg" className="min-h-11" onClick={onSubmit} disabled={!canSubmit || submitting}>
            {submitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null} Verificar
          </Button>
        )}
        {result && result.verdict === "correct" && (
          <Button size="lg" className="min-h-11" onClick={onNext}>
            {stageKey === "practice" ? "Aplicar em outro contexto" : "Concluir ponto"}{" "}
            <ArrowRight className="ml-1 size-4" />
          </Button>
        )}
        {result && result.verdict !== "correct" && !showAnswer && (
          <Button size="lg" variant="outline" className="min-h-11" onClick={tryAgain}>
            <RefreshCw className="mr-1 size-4" /> Tentar novamente
          </Button>
        )}
        {result && result.verdict !== "correct" && showAnswer && (
          <Button size="lg" className="min-h-11" onClick={onNext}>
            Entendi, próximo <ArrowRight className="ml-1 size-4" />
          </Button>
        )}
      </div>
    </article>
  );
}
