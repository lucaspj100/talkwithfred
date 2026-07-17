import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listTrainingHistory } from "@/lib/training.functions";
import { Button } from "@/components/ui/button";
import { ArrowLeft, History, Loader2, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/practice/historico")({
  component: HistoryPage,
});

function HistoryPage() {
  const list = useServerFn(listTrainingHistory);
  const q = useQuery({ queryKey: ["training-history"], queryFn: () => list({ data: { limit: 30 } }) });
  const rows = (q.data ?? []) as Array<{ id: string; training_date: string; status: string; total_items: number; completed_items: number; correct_items: number; xp_earned: number | null; is_extra: boolean; completed_at: string | null }>;

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/practice"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 size-4" />Treinos</Button></Link>
      </header>
      <h1 className="font-display text-2xl font-bold flex items-center gap-2"><History className="size-6 text-primary" /> Histórico de treinos</h1>

      {q.isLoading ? (
        <div className="mt-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum treino ainda. Comece o treino de hoje.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium">{new Date(r.training_date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</p>
                <p className="text-xs text-muted-foreground">
                  {r.status === "completed" ? `${r.correct_items}/${r.total_items} corretos` : `${r.completed_items}/${r.total_items} concluídos · ${statusLabel(r.status)}`}
                  {r.is_extra ? " · extra" : ""}
                </p>
              </div>
              {r.xp_earned ? (
                <div className="flex items-center gap-1 text-primary text-sm font-medium">
                  <Trophy className="size-4" /> +{r.xp_earned} XP
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusLabel(s: string) {
  if (s === "in_progress") return "em andamento";
  if (s === "ready") return "não iniciado";
  return s;
}
