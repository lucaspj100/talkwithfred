import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  startFreeSession,
  getNextFreeExercise,
  submitFreeAnswer,
  endFreeSession,
  type FreeMode,
} from "@/lib/free-practice.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowRight, Check, Flame, Loader2, RotateCcw, Sparkles, Trophy, X, Zap } from "lucide-react";

const searchSchema = z.object({
  mode: z.enum(["fill_blank", "choice", "correct_error", "my_errors", "quick_challenge", "infinite"]).default("choice"),
  topic: z.string().optional(),
  level: z.enum(["basic", "intermediate", "advanced"]).optional(),
});

export const Route = createFileRoute("/_authenticated/practice/livre")({
  validateSearch: searchSchema,
  component: FreePracticePlayer,
});

const MODE_LABEL: Record<FreeMode, { title: string; hint: string }> = {
  fill_blank: { title: "Completar frases", hint: "Preencha a palavra que falta." },
  choice: { title: "Múltipla escolha", hint: "Escolha a opção correta." },
  correct_error: { title: "Corrigir erros", hint: "Descubra o erro na frase." },
  my_errors: { title: "Praticar meus erros", hint: "Erros que você cometeu nas conversas." },
  quick_challenge: { title: "Desafio rápido", hint: "60 segundos, acerte o máximo!" },
  infinite: { title: "Modo infinito", hint: "Pratique sem limite." },
};

type Exercise = Awaited<ReturnType<typeof getNextFreeExercise>>;

function FreePracticePlayer() {
  const { mode, topic, level } = useSearch({ from: "/_authenticated/practice/livre" });
  const navigate = useNavigate();
  const startFn = useServerFn(startFreeSession);
  const nextFn = useServerFn(getNextFreeExercise);
  const submitFn = useServerFn(submitFreeAnswer);
  const endFn = useServerFn(endFreeSession);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  const [exercise, setExercise] = useState<Exercise>(null);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [answer, setAnswer] = useState<string>("");
  const [reorder, setReorder] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<null | { verdict: "correct" | "close" | "wrong"; correct: string; explanation_pt: string | null }>(null);
  const [stats, setStats] = useState({ correct: 0, wrong: 0, xp: 0 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const initRan = useRef(false);

  const loadNext = useCallback(async (sid: string, exclude: string[]) => {
    setLoading(true);
    try {
      const ex = await nextFn({ data: { sessionId: sid, excludeIds: exclude.slice(-100) } });
      if (!ex) {
        toast.info("Sem mais exercícios com esses filtros por enquanto.");
        setFinished(true);
        return;
      }
      setExercise(ex);
      setAnswer("");
      setReorder([]);
      setFeedback(null);
      startTimeRef.current = Date.now();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar exercício.");
    } finally {
      setLoading(false);
    }
  }, [nextFn]);

  // Start session on mount
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    (async () => {
      try {
        const sess = await startFn({ data: { mode, topic, level } });
        setSessionId(sess.id);
        setTimeLimit(sess.time_limit_seconds ?? null);
        if (sess.time_limit_seconds) setRemaining(sess.time_limit_seconds);
        await loadNext(sess.id, []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível iniciar.");
      }
    })();
  }, [mode, topic, level, startFn, loadNext]);

  // Timer for quick_challenge
  useEffect(() => {
    if (!timeLimit || finished) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r === null) return r;
        if (r <= 1) {
          clearInterval(t);
          setFinished(true);
          if (sessionId) endFn({ data: { sessionId } }).catch(() => {});
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [timeLimit, finished, sessionId, endFn]);

  const handleSubmit = useCallback(async () => {
    if (!sessionId || !exercise) return;
    const finalAnswer = exercise.exercise_type === "reorder_sentence" ? reorder.join(" ") : answer;
    if (!finalAnswer.trim()) return;
    setSubmitting(true);
    try {
      const res = await submitFn({
        data: {
          sessionId,
          sourceType: exercise.source_type,
          sourceId: exercise.source_id,
          exerciseType: exercise.exercise_type,
          promptSnapshot: exercise.prompt,
          correctSnapshot: exercise.correct_answer,
          acceptable: exercise.acceptable_answers,
          userAnswer: finalAnswer,
          responseTimeMs: Date.now() - startTimeRef.current,
        },
      });
      setFeedback({ verdict: res.verdict, correct: exercise.correct_answer, explanation_pt: exercise.explanation_pt });
      setStats((s) => ({
        correct: s.correct + (res.correct ? 1 : 0),
        wrong: s.wrong + (res.correct ? 0 : 1),
        xp: s.xp + res.xp_earned,
      }));
      setSeenIds((ids) => [...ids, exercise.source_id]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar resposta.");
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, exercise, answer, reorder, submitFn]);

  const handleNext = useCallback(async () => {
    if (!sessionId) return;
    if (timeLimit && remaining === 0) return;
    await loadNext(sessionId, seenIds);
  }, [sessionId, loadNext, seenIds, timeLimit, remaining]);

  const handleFinish = useCallback(async () => {
    if (sessionId) await endFn({ data: { sessionId } }).catch(() => {});
    setFinished(true);
  }, [sessionId, endFn]);

  const info = MODE_LABEL[mode as FreeMode];

  if (finished) {
    return (
      <div className="mx-auto max-w-lg pb-24 md:pb-6">
        <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-8 text-center">
          <Trophy className="mx-auto size-12 text-primary" />
          <h1 className="mt-3 font-display text-2xl font-bold">Sessão encerrada</h1>
          <p className="mt-1 text-muted-foreground">Ótimo trabalho praticando!</p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <StatMini icon={<Check className="size-4 text-green-500" />} label="Acertos" value={stats.correct} />
            <StatMini icon={<X className="size-4 text-red-500" />} label="Erros" value={stats.wrong} />
            <StatMini icon={<Zap className="size-4 text-amber-500" />} label="XP" value={stats.xp} />
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={() => { setFinished(false); setStats({ correct: 0, wrong: 0, xp: 0 }); setSeenIds([]); initRan.current = false; }}>
              <RotateCcw className="mr-1 size-4" /> Praticar de novo
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/practice" })}>Voltar aos treinos</Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !exercise) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-24 md:pb-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-primary">Prática livre</p>
          <h1 className="font-display text-2xl font-bold">{info.title}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1 text-green-500"><Check className="size-4" />{stats.correct}</span>
          <span className="flex items-center gap-1 text-red-500"><X className="size-4" />{stats.wrong}</span>
          <span className="flex items-center gap-1 text-amber-500"><Zap className="size-4" />{stats.xp}</span>
          {timeLimit && (
            <span className={`flex items-center gap-1 font-mono ${remaining !== null && remaining <= 10 ? "text-red-500" : ""}`}>
              <Flame className="size-4" />{remaining}s
            </span>
          )}
        </div>
      </div>

      {/* Exercise card */}
      <div className="rounded-3xl border border-border bg-card/60 p-6">
        {exercise.instructions && <p className="mb-2 text-xs uppercase text-muted-foreground">{exercise.instructions}</p>}
        <p className="text-lg leading-relaxed">{exercise.prompt}</p>

        {/* Answer area */}
        <div className="mt-6">
          {exercise.exercise_type === "reorder_sentence" ? (
            <ReorderInput
              tokens={exercise.options}
              value={reorder}
              onChange={setReorder}
              disabled={!!feedback}
            />
          ) : exercise.options && exercise.options.length > 0 ? (
            <div className="grid gap-2">
              {exercise.options.map((opt) => {
                const selected = answer === opt;
                const isCorrect = feedback && opt === exercise.correct_answer;
                const isWrongPick = feedback && selected && opt !== exercise.correct_answer;
                return (
                  <button
                    key={opt}
                    disabled={!!feedback}
                    onClick={() => setAnswer(opt)}
                    className={`rounded-xl border p-3 text-left transition ${
                      isCorrect
                        ? "border-green-500 bg-green-500/10"
                        : isWrongPick
                          ? "border-red-500 bg-red-500/10"
                          : selected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/40"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={!!feedback}
              placeholder="Digite sua resposta"
              className="w-full rounded-xl border border-border bg-background p-3 outline-none focus:border-primary"
              onKeyDown={(e) => { if (e.key === "Enter" && !feedback) handleSubmit(); }}
              autoFocus
            />
          )}
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`mt-4 rounded-2xl border p-4 ${
            feedback.verdict === "correct"
              ? "border-green-500/50 bg-green-500/10"
              : feedback.verdict === "close"
                ? "border-amber-500/50 bg-amber-500/10"
                : "border-red-500/50 bg-red-500/10"
          }`}>
            <p className="font-medium">
              {feedback.verdict === "correct" ? "Correto! 🎉" : feedback.verdict === "close" ? "Quase!" : "Não foi dessa vez"}
            </p>
            <p className="mt-1 text-sm">Resposta: <span className="font-medium">{feedback.correct}</span></p>
            {feedback.explanation_pt && <p className="mt-1 text-xs text-muted-foreground">{feedback.explanation_pt}</p>}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {!feedback ? (
            <Button
              onClick={handleSubmit}
              disabled={submitting || (exercise.exercise_type === "reorder_sentence" ? reorder.length === 0 : !answer.trim())}
            >
              {submitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Sparkles className="mr-1 size-4" />}
              Verificar
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Próximo <ArrowRight className="ml-1 size-4" />
            </Button>
          )}
          <Button variant="ghost" onClick={handleFinish}>Encerrar</Button>
        </div>
      </div>
    </div>
  );
}

function StatMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">{icon}{label}</div>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}

function ReorderInput({
  tokens,
  value,
  onChange,
  disabled,
}: {
  tokens: string[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const remaining = tokens
    .map((t, i) => ({ label: t, key: `${i}` }))
    .filter((t) => !value.includes(t.key));

  return (
    <div className="space-y-3">
      <div className="min-h-[52px] rounded-xl border border-dashed border-border bg-background p-2">
        <div className="flex flex-wrap gap-2">
          {value.length === 0 && <span className="text-sm text-muted-foreground p-1">Monte a frase aqui</span>}
          {value.map((k) => {
            const idx = Number(k);
            return (
              <button
                key={k}
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x !== k))}
                className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-1 text-sm hover:bg-primary/20"
              >
                {tokens[idx]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {remaining.map((t) => (
          <button
            key={t.key}
            disabled={disabled}
            onClick={() => onChange([...value, t.key])}
            className="rounded-lg border border-border bg-card px-3 py-1 text-sm hover:border-primary/60"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

