import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { startConversationReview, getReviewByConversation, retryConversationReview } from "@/lib/reviews.functions";
import { Button } from "@/components/ui/button";
import { FredAvatar } from "@/components/FredBrand";
import { Loader2, Sparkles, ArrowLeft, ArrowRight, RefreshCw, MessageCircle, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chat/$conversationId/revisao")({
  component: ReviewSummaryPage,
});

function ReviewSummaryPage() {
  const { conversationId } = Route.useParams();
  const navigate = useNavigate();
  const start = useServerFn(startConversationReview);
  const fetchReview = useServerFn(getReviewByConversation);
  const retry = useServerFn(retryConversationReview);
  const [kicked, setKicked] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Kick off idempotent review generation.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        await start({ data: { conversationId } });
      } catch (e) {
        console.error("[start review]", e);
        if (!cancel) toast.error("Não conseguimos iniciar a revisão. Tente novamente.");
      } finally {
        if (!cancel) setKicked(true);
      }
    })();
    return () => { cancel = true; };
  }, [conversationId, start]);

  const query = useQuery({
    queryKey: ["review-by-conv", conversationId],
    queryFn: () => fetchReview({ data: { conversationId } }),
    enabled: kicked,
    refetchInterval: (q) => {
      const d = q.state.data as { review: { status: string } | null } | undefined;
      const status = d?.review?.status;
      if (!status) return 2000;
      if (status === "processing") return 2000;
      return false;
    },
  });

  const review = query.data?.review as
    | { id: string; status: string; title: string | null; summary: string | null; total_items: number; estimated_minutes: number; level_detected?: string | null }
    | null
    | undefined;
  const items = (query.data?.items ?? []) as Array<{ id: string; type: string; category: string | null; original_text: string | null; corrected_text: string | null; natural_text: string | null }>;

  async function onRetry() {
    if (!review) return;
    setRetrying(true);
    try {
      await retry({ data: { reviewId: review.id } });
      await query.refetch();
    } catch (e) {
      toast.error((e as Error)?.message || "Falha ao tentar novamente.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-4 py-6" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)" }}>
      <header className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 size-4" /> Dashboard
        </Button>
        <Link to="/revisoes" className="text-xs text-muted-foreground hover:text-primary">Minhas revisões</Link>
      </header>

      <div className="flex flex-col items-center text-center">
        <div className="fred-ring h-24 w-24" data-state="thinking">
          <FredAvatar alt="Fred" className="h-24 w-24 ring-0 text-3xl" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold">Sua conversa terminou</h1>
      </div>

      {/* Loading */}
      {(!review || review.status === "processing") && (
        <div className="mt-8 rounded-3xl border border-border bg-card/50 p-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
          <p className="mt-3 font-medium">Fred está preparando uma revisão personalizada da sua conversa.</p>
          <p className="mt-1 text-sm text-muted-foreground">Estamos separando os pontos mais importantes para você praticar.</p>
        </div>
      )}

      {/* Skipped */}
      {review?.status === "skipped" && (
        <div className="mt-8 rounded-3xl border border-border bg-card/50 p-6">
          <p className="text-center font-medium">Essa conversa foi curta demais para gerar uma revisão personalizada.</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate({ to: "/dashboard" })} variant="outline">
              <Home className="mr-1 size-4" /> Voltar ao dashboard
            </Button>
            <Button onClick={() => navigate({ to: "/dashboard" })}>
              <MessageCircle className="mr-1 size-4" /> Conversar novamente
            </Button>
          </div>
        </div>
      )}

      {/* Failed */}
      {review?.status === "failed" && (
        <div className="mt-8 rounded-3xl border border-destructive/40 bg-destructive/5 p-6">
          <p className="text-center font-medium">Não conseguimos preparar sua revisão agora.</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="mr-1 size-4 animate-spin" /> : <RefreshCw className="mr-1 size-4" />} Tentar novamente
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>Voltar ao dashboard</Button>
          </div>
        </div>
      )}

      {/* Ready / in-progress / completed → summary */}
      {review && (review.status === "ready" || review.status === "in_progress" || review.status === "completed") && (
        <div className="mt-8 rounded-3xl border border-border bg-card/50 p-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" /> Revisão da sua conversa
          </div>
          <h2 className="font-display text-xl font-bold">{review.title || "Sua conversa"}</h2>
          {review.summary && <p className="mt-2 text-sm text-muted-foreground">{review.summary}</p>}

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <InfoPill label="Pontos" value={String(review.total_items)} />
            <InfoPill label="Tempo estimado" value={`~${review.estimated_minutes} min`} />
          </div>

          {items.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Prévia</p>
              <ul className="space-y-2">
                {items.slice(0, 3).map((it) => (
                  <li key={it.id} className="rounded-2xl border border-border bg-background/40 p-3 text-sm">
                    <span className="text-[11px] font-semibold uppercase text-primary">{humanType(it.type)}</span>
                    {it.category && <span className="ml-2 text-[11px] text-muted-foreground">{it.category}</span>}
                    {it.original_text && <p className="mt-1 line-clamp-1 text-muted-foreground">“{it.original_text}”</p>}
                  </li>
                ))}
                {items.length > 3 && (
                  <li className="text-center text-xs text-muted-foreground">
                    +{items.length - 3} pontos aparecem quando você começar a revisão
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <Button size="lg" onClick={() => navigate({ to: "/revisoes/$reviewId", params: { reviewId: review.id } })}>
              Revisar agora <ArrowRight className="ml-1 size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                toast.success("Revisão salva. Você pode continuar quando quiser.");
                navigate({ to: "/dashboard" });
              }}
            >
              Salvar para depois
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/dashboard" })}>
              Voltar ao dashboard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/40 p-3">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

export function humanType(t: string): string {
  switch (t) {
    case "grammar_error": return "Erro gramatical";
    case "unnatural_phrase": return "Mais natural";
    case "vocabulary": return "Vocabulário";
    case "word_choice": return "Escolha de palavra";
    case "incomplete_answer": return "Resposta incompleta";
    case "pronunciation_note": return "Pronúncia";
    case "positive_feedback": return "Ponto positivo";
    case "general_improvement": return "Sugestão";
    default: return "Ponto";
  }
}
