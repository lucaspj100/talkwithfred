import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyReviews } from "@/lib/reviews.functions";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Loader2, RefreshCw, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/revisoes/")({
  component: MyReviewsPage,
});

type Row = {
  id: string;
  conversation_id: string;
  status: string;
  title: string | null;
  summary: string | null;
  total_items: number;
  completed_items: number;
  estimated_minutes: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  started_at: string | null;
};

function MyReviewsPage() {
  const list = useServerFn(listMyReviews);
  const q = useQuery({ queryKey: ["my-reviews"], queryFn: () => list() });
  const rows = ((q.data ?? []) as Row[]).slice();

  const pending = rows.filter((r) => r.status === "ready");
  const inProgress = rows.filter((r) => r.status === "in_progress");
  const done = rows.filter((r) => r.status === "completed");
  const failing = rows.filter((r) => r.status === "failed" || r.status === "processing");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 5rem)" }}>
      <header className="mb-6 flex items-center gap-3">
        <Link to="/dashboard"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 size-4" /> Dashboard</Button></Link>
      </header>
      <h1 className="font-display text-2xl font-bold">Minhas revisões</h1>
      <p className="mt-1 text-sm text-muted-foreground">Revise os pontos mais importantes das suas conversas com Fred.</p>

      {q.isLoading && (
        <div className="mt-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</div>
      )}

      {!q.isLoading && rows.length === 0 && (
        <div className="mt-8 rounded-3xl border border-dashed border-border p-8 text-center">
          <Sparkles className="mx-auto size-8 text-primary" />
          <p className="mt-3 font-medium">Você ainda não tem revisões.</p>
          <p className="mt-1 text-sm text-muted-foreground">Converse com Fred e nós vamos preparar uma revisão personalizada ao final.</p>
          <Link to="/dashboard"><Button className="mt-4">Conversar com Fred</Button></Link>
        </div>
      )}

      {failing.length > 0 && (
        <Section title="Processando ou com erro" icon={<RefreshCw className="size-4" />}>
          {failing.map((r) => <ReviewCard key={r.id} row={r} />)}
        </Section>
      )}
      {inProgress.length > 0 && (
        <Section title="Em andamento" icon={<Clock className="size-4" />}>
          {inProgress.map((r) => <ReviewCard key={r.id} row={r} />)}
        </Section>
      )}
      {pending.length > 0 && (
        <Section title="Pendentes" icon={<Sparkles className="size-4" />}>
          {pending.map((r) => <ReviewCard key={r.id} row={r} />)}
        </Section>
      )}
      {done.length > 0 && (
        <Section title="Concluídas" icon={<CheckCircle2 className="size-4" />}>
          {done.map((r) => <ReviewCard key={r.id} row={r} />)}
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">{icon} {title}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function ReviewCard({ row }: { row: Row }) {
  const navigate = useNavigate();
  const isDone = row.status === "completed";
  const isFailed = row.status === "failed";
  const isProcessing = row.status === "processing";
  const cta = isDone ? "Ver novamente" : row.status === "in_progress" ? "Continuar" : isProcessing ? "Ver progresso" : isFailed ? "Tentar novamente" : "Começar revisão";

  const progressText =
    row.status === "in_progress"
      ? `${row.completed_items} de ${row.total_items} concluídos`
      : `${row.total_items} pontos · ~${row.estimated_minutes} min`;

  const target = isProcessing
    ? { to: "/chat/$conversationId/revisao" as const, params: { conversationId: row.conversation_id } }
    : isFailed
      ? { to: "/chat/$conversationId/revisao" as const, params: { conversationId: row.conversation_id } }
      : { to: "/revisoes/$reviewId" as const, params: { reviewId: row.id } };

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/40 p-4">
      <div className="min-w-0">
        <p className="truncate font-medium">{row.title || "Conversa"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {new Date(row.created_at).toLocaleString("pt-BR")} · {progressText}
        </p>
      </div>
      <Button size="sm" onClick={() => navigate(target)}>
        {cta} <ArrowRight className="ml-1 size-3.5" />
      </Button>
    </div>
  );
}
