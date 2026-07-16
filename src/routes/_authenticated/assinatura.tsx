import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMySubscription, refreshMySubscription } from "@/lib/subscription.functions";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assinatura")({
  head: () => ({ meta: [{ title: "Minha assinatura — Talk With Fred" }] }),
  component: AssinaturaPage,
});

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "authorized":
    case "active":
      return { label: "Ativa", tone: "ok" as const };
    case "pending":
      return { label: "Pagamento pendente", tone: "warn" as const };
    case "paused":
      return { label: "Pausada", tone: "warn" as const };
    case "past_due":
    case "payment_required":
      return { label: "Pagamento em atraso", tone: "danger" as const };
    case "cancelled":
      return { label: "Cancelada", tone: "danger" as const };
    default:
      return { label: "Sem assinatura", tone: "neutral" as const };
  }
}

function AssinaturaPage() {
  const getSub = useServerFn(getMySubscription);
  const refresh = useServerFn(refreshMySubscription);
  const qc = useQueryClient();

  const { data: sub, isLoading } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => getSub(),
  });

  const mutation = useMutation({
    mutationFn: () => refresh(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-subscription"] });
      toast.success("Status atualizado.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao atualizar."),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const meta = statusLabel(sub?.status);
  const available = Number(sub?.minutes_available ?? 0);
  const used = Number(sub?.minutes_used ?? 0);
  const total = Number(sub?.monthly_minutes ?? 120);
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const active = sub?.status === "authorized" || sub?.status === "active";

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 font-display text-3xl font-extrabold">Minha assinatura</h1>

      {!sub ? (
        <div className="rounded-3xl border border-border bg-card/60 p-6 text-center">
          <p className="mb-4 text-sm text-muted-foreground">Você ainda não tem uma assinatura.</p>
          <Link to="/planos">
            <Button className="rounded-full bg-cta text-cta-foreground hover:bg-cta/90">
              Ver planos
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-card/60 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <p
                  className={`font-semibold ${
                    meta.tone === "ok"
                      ? "text-primary"
                      : meta.tone === "danger"
                        ? "text-destructive"
                        : meta.tone === "warn"
                          ? "text-amber-500"
                          : ""
                  }`}
                >
                  {meta.label}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                <RefreshCw className={`mr-1 size-4 ${mutation.isPending ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano</p>
                <p>{sub.plan_name ?? "Talk With Fred"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor</p>
                <p>R$ 49/mês</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Próxima cobrança</p>
                <p>{sub.next_payment_date ? new Date(sub.next_payment_date).toLocaleDateString("pt-BR") : "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Último pagamento</p>
                <p>{sub.last_payment_at ? new Date(sub.last_payment_at).toLocaleDateString("pt-BR") : "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card/60 p-6">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-semibold">Minutos disponíveis</p>
              <p className="text-sm text-muted-foreground">
                {available.toFixed(1)} / {total} min
              </p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${100 - pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {used.toFixed(1)} min usados neste ciclo.
            </p>
          </div>

          {!active && (
            <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              {sub.status === "pending"
                ? "Estamos confirmando seu pagamento. Isso pode levar alguns minutos."
                : sub.status === "cancelled"
                  ? "Sua assinatura está cancelada. Assine novamente para voltar a conversar com Fred."
                  : "Regularize sua assinatura para continuar praticando."}
              <div className="mt-3">
                <Link to="/planos">
                  <Button size="sm" className="rounded-full bg-cta text-cta-foreground hover:bg-cta/90">
                    {sub.status === "cancelled" ? "Assinar novamente" : "Regularizar"}
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
