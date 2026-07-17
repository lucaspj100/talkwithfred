import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getReview, beginReview, completeReviewItem, completeReview } from "@/lib/reviews.functions";
import { humanType } from "./chat.$conversationId.revisao";
import { Button } from "@/components/ui/button";
import { FredAvatar } from "@/components/FredBrand";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, MessageCircle, Home, Sparkles } from "lucide-react";
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

function ReviewPlayerPage() {
  const { reviewId } = Route.useParams();
  const navigate = useNavigate();
  const fetchReview = useServerFn(getReview);
  const begin = useServerFn(beginReview);
  const completeItem = useServerFn(completeReviewItem);
  const finish = useServerFn(completeReview);

  const q = useQuery({
    queryKey: ["review", reviewId],
    queryFn: () => fetchReview({ data: { reviewId } }),
  });

  const review = q.data?.review as Review | undefined;
  const items = useMemo(() => ((q.data?.items ?? []) as Item[]).slice().sort((a, b) => a.display_order - b.display_order), [q.data]);

  const [idx, setIdx] = useState(0);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (review && review.status === "ready") {
      begin({ data: { reviewId } }).catch(() => { /* non-fatal */ });
    }
  }, [review, reviewId, begin]);

  if (q.isLoading || !review) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const done = review.status === "completed" || idx >= items.length;
  const current = items[idx];

  async function onNext() {
    if (!current) return;
    if (!current.completed) {
      try {
        await completeItem({ data: { itemId: current.id } });
      } catch (e) {
        console.error(e);
      }
    }
    if (idx + 1 >= items.length) {
      // Finalizar
      setFinishing(true);
      try {
        await finish({ data: { reviewId } });
        await q.refetch();
      } catch (e) {
        toast.error("Não conseguimos concluir a revisão. Tente novamente.");
      } finally {
        setFinishing(false);
      }
      setIdx((n) => n + 1);
    } else {
      setIdx((n) => n + 1);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-4 py-6" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 5rem)" }}>
      <header className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/revisoes" })}>
          <ArrowLeft className="mr-1 size-4" /> Minhas revisões
        </Button>
        {!done && items.length > 0 && (
          <p className="text-xs text-muted-foreground">Ponto {Math.min(idx + 1, items.length)} de {items.length}</p>
        )}
      </header>

      {/* Progress bar */}
      {!done && items.length > 0 && (
        <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(idx / items.length) * 100}%` }}
          />
        </div>
      )}

      {!done && current && (
        <article className="rounded-3xl border border-border bg-card/50 p-5 md:p-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" /> {humanType(current.type)}
            {current.category && <span className="text-primary/60">· {current.category}</span>}
          </div>

          {current.original_text && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Você disse</p>
              <p className="mt-1 rounded-2xl bg-destructive/5 p-3 text-sm">“{current.original_text}”</p>
            </div>
          )}

          {(current.natural_text || current.corrected_text) && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Uma forma melhor</p>
              <p className="mt-1 rounded-2xl bg-primary/10 p-3 text-sm font-medium">“{current.natural_text || current.corrected_text}”</p>
              {current.translation_pt && (
                <p className="mt-1 text-xs text-muted-foreground">🇧🇷 {current.translation_pt}</p>
              )}
            </div>
          )}

          {current.explanation_pt && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Explicação</p>
              <p className="mt-1 text-sm leading-relaxed">{current.explanation_pt}</p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <Button size="lg" onClick={onNext} disabled={finishing}>
              {finishing ? <Loader2 className="mr-1 size-4 animate-spin" /> : idx + 1 >= items.length ? "Concluir revisão" : "Entendi, próximo"}
              {!finishing && <ArrowRight className="ml-1 size-4" />}
            </Button>
          </div>
        </article>
      )}

      {done && (
        <div className="mt-4 flex flex-col items-center rounded-3xl border border-border bg-card/50 p-6 text-center">
          <div className="fred-ring h-20 w-20" data-state="idle">
            <FredAvatar alt="Fred" className="h-20 w-20 ring-0" />
          </div>
          <CheckCircle2 className="mt-3 size-8 text-primary" />
          <h1 className="mt-3 font-display text-2xl font-bold">Revisão concluída!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Você revisou {review.total_items} ponto{review.total_items === 1 ? "" : "s"} da sua conversa.
          </p>
          <div className="mt-6 grid w-full grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border border-border bg-background/40 p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Pontos</p>
              <p className="mt-0.5 font-semibold">{review.total_items}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/40 p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Tempo estimado</p>
              <p className="mt-0.5 font-semibold">~{review.estimated_minutes} min</p>
            </div>
          </div>
          <div className="mt-6 flex w-full flex-col gap-2">
            <Button size="lg" onClick={() => navigate({ to: "/dashboard" })}>
              <MessageCircle className="mr-1 size-4" /> Conversar novamente
            </Button>
            <Link to="/dashboard"><Button size="lg" variant="outline" className="w-full"><Home className="mr-1 size-4" /> Voltar ao dashboard</Button></Link>
          </div>
        </div>
      )}
    </div>
  );
}
