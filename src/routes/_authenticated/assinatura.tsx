import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getMySubscription,
  syncMySubscription,
  cancelMySubscription,
} from "@/lib/subscription.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw, XCircle, MessageCircle, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assinatura")({
  head: () => ({ meta: [{ title: "Minha assinatura — Talk With Fred" }] }),
  component: AssinaturaPage,
});

type StatusMeta = {
  label: string;
  tone: "ok" | "warn" | "danger" | "neutral";
  help: string;
};

function statusMeta(status: string | null | undefined, minutesAvailable: number): StatusMeta {
  switch (status) {
    case "authorized":
    case "active":
      if (minutesAvailable <= 0) {
        return {
          label: "Ativa",
          tone: "warn",
          help: "Você utilizou os 90 minutos deste ciclo. O saldo será renovado na próxima cobrança.",
        };
      }
      return { label: "Ativa", tone: "ok", help: "Seu plano está ativo." };
    case "pending":
      return { label: "Pagamento pendente", tone: "warn", help: "Estamos confirmando seu pagamento. Isso pode levar alguns minutos." };
    case "paused":
      return { label: "Pausada", tone: "warn", help: "Sua assinatura está pausada." };
    case "past_due":
    case "payment_required":
      return { label: "Pagamento pendente", tone: "danger", help: "Não conseguimos confirmar sua última cobrança. Regularize para continuar usando o Fred." };
    case "cancelled":
    case "canceled":
      return { label: "Cancelada", tone: "danger", help: "Sua assinatura foi cancelada." };
    default:
      return { label: "Sem assinatura", tone: "neutral", help: "Assine para começar a praticar." };
  }
}

function AssinaturaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getSub = useServerFn(getMySubscription);
  const syncFn = useServerFn(syncMySubscription);
  const cancelFn = useServerFn(cancelMySubscription);

  const { data: sub, isLoading } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => getSub(),
  });

  const [cooldownAt, setCooldownAt] = useState<number>(0);
  const cooldownRemaining = Math.max(0, cooldownAt - Date.now());

  const syncMut = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-subscription"] });
      setCooldownAt(Date.now() + 30_000);
      toast.success("Status atualizado.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar."),
  });

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const cancelMut = useMutation({
    mutationFn: () => cancelFn({ data: { reason } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-subscription"] });
      setCancelOpen(false);
      setReason("");
      toast.success("Sua assinatura foi cancelada.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao cancelar."),
  });

  if (isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  const status = sub?.status ?? null;
  const active = status === "authorized" || status === "active";
  const pending = status === "pending";
  const cancelled = status === "cancelled" || status === "canceled";
  const paused = status === "paused";
  const needsPayment = status === "past_due" || status === "payment_required";
  const available = Number(sub?.minutes_available ?? 0);
  const used = Number(sub?.minutes_used ?? 0);
  const total = Number(sub?.monthly_minutes ?? 90);
  const showBalance = active; // Only show minutes as usable when active
  const usedPct = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
  const meta = statusMeta(status, available);
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end as string) : null;
  const cancelledStillActive = cancelled && periodEnd && periodEnd > new Date();
  const zero = active && available <= 0;

  // Primary action based on status
  let primary: { label: string; onClick?: () => void; to?: string; disabled?: boolean } | null = null;
  if (active && !zero) {
    primary = { label: "Conversar com Fred", to: "/dashboard" };
  } else if (active && zero) {
    primary = { label: "Ver próxima renovação", to: "/assinatura", disabled: true };
  } else if (pending) {
    primary = { label: "Atualizar status", onClick: () => syncMut.mutate(), disabled: syncMut.isPending || cooldownRemaining > 0 };
  } else if (needsPayment) {
    primary = { label: "Regularizar pagamento", to: "/planos" };
  } else if (paused) {
    primary = { label: "Regularizar assinatura", to: "/planos" };
  } else if (cancelled) {
    primary = { label: "Assinar novamente", to: "/planos" };
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-6 md:py-10">
      <h1 className="mb-6 font-display text-2xl font-extrabold md:text-3xl">Minha assinatura</h1>

      {!sub ? (
        <div className="rounded-3xl border border-border bg-card/60 p-6 text-center">
          <p className="mb-4 text-sm text-muted-foreground">Você ainda não tem uma assinatura.</p>
          <Link to="/planos"><Button className="rounded-full bg-cta text-cta-foreground hover:bg-cta/90">Ver planos</Button></Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header card */}
          <div className="rounded-3xl border border-border bg-card/60 p-5 md:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano</p>
                <p className="font-display text-lg font-bold">Talk With Fred</p>
                <p className="text-sm text-muted-foreground">R$ 49 / mês · 90 minutos</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <p className={`font-semibold ${
                  meta.tone === "ok" ? "text-primary"
                  : meta.tone === "danger" ? "text-destructive"
                  : meta.tone === "warn" ? "text-amber-500" : ""
                }`}>{meta.label}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{meta.help}</p>

            {/* Primary action */}
            {primary && (
              <div className="mt-4">
                {primary.to && !primary.onClick ? (
                  <Link to={primary.to}>
                    <Button
                      size="lg"
                      disabled={primary.disabled}
                      className="h-11 w-full rounded-full bg-cta text-base font-semibold text-cta-foreground hover:bg-cta/90 sm:w-auto sm:px-8"
                    >
                      {active && !zero && <MessageCircle className="mr-2 size-4" />}
                      {primary.label}
                    </Button>
                  </Link>
                ) : (
                  <Button
                    size="lg"
                    disabled={primary.disabled}
                    onClick={primary.onClick}
                    className="h-11 w-full rounded-full bg-cta text-base font-semibold text-cta-foreground hover:bg-cta/90 sm:w-auto sm:px-8"
                  >
                    {(syncMut.isPending && pending) && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {primary.label}
                    {cooldownRemaining > 0 && pending && (
                      <span className="ml-2 text-xs opacity-80">({Math.ceil(cooldownRemaining / 1000)}s)</span>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Secondary sync (always visible for transparency) */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Button variant="ghost" size="sm"
                onClick={() => syncMut.mutate()}
                disabled={syncMut.isPending || cooldownRemaining > 0}>
                <RefreshCw className={`mr-1 size-3.5 ${syncMut.isPending ? "animate-spin" : ""}`} />
                {cooldownRemaining > 0 ? `Aguarde ${Math.ceil(cooldownRemaining / 1000)}s` : "Atualizar status"}
              </Button>
              {sub.last_synced_at && (
                <span>Últ. sincronização: {new Date(sub.last_synced_at as string).toLocaleString("pt-BR")}</span>
              )}
            </div>
          </div>

          {/* Minutes card */}
          <div className="rounded-3xl border border-border bg-card/60 p-5 md:p-6">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">Minutos deste ciclo</p>
              {showBalance ? (
                <p className="text-sm text-muted-foreground">
                  {available.toFixed(0)} / {total} min disponíveis
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Indisponível</p>
              )}
            </div>
            {showBalance ? (
              <>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${zero ? "bg-destructive" : available < 10 ? "bg-amber-500" : "bg-primary"}`}
                    style={{ width: `${Math.max(0, 100 - usedPct)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {used.toFixed(1)} min usados neste ciclo.
                </p>
              </>
            ) : (
              <>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-muted opacity-50"
                  aria-hidden
                >
                  <div className="h-full w-0 rounded-full bg-muted-foreground/40" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {pending
                    ? "Disponível após confirmação do pagamento."
                    : cancelled
                    ? "Assinatura encerrada — sem saldo disponível."
                    : needsPayment
                    ? "Regularize o pagamento para liberar os minutos."
                    : paused
                    ? "Assinatura pausada — saldo indisponível."
                    : "Assine para receber 120 minutos por ciclo."}
                </p>
              </>
            )}
          </div>

          {/* Details */}
          <div className="rounded-3xl border border-border bg-card/40 p-5 md:p-6">
            <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Detalhes do ciclo</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Detail label="Início do ciclo" value={sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString("pt-BR") : "—"} />
              <Detail label="Fim do ciclo" value={periodEnd ? periodEnd.toLocaleDateString("pt-BR") : "—"} />
              <Detail label="Próxima cobrança" value={sub.next_payment_date ? new Date(sub.next_payment_date).toLocaleDateString("pt-BR") : "—"} />
              <Detail label="Último pagamento" value={sub.last_payment_at ? new Date(sub.last_payment_at).toLocaleDateString("pt-BR") : "—"} />
            </div>
          </div>

          {/* State alerts */}
          {cancelled && (
            <div className="flex items-start gap-3 rounded-3xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-500" />
              <div className="min-w-0">
                {cancelledStillActive
                  ? <>Sua assinatura foi cancelada. Você tem acesso até {periodEnd?.toLocaleDateString("pt-BR")}.</>
                  : <>Seu acesso foi encerrado.</>}
              </div>
            </div>
          )}

          {pending && (
            <div className="flex items-start gap-3 rounded-3xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <Clock className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div>Estamos confirmando seu pagamento. Isso pode levar alguns minutos. Clique em “Atualizar status” caso já tenha pago.</div>
            </div>
          )}

          {/* Cancel */}
          {(active || needsPayment || paused) && (
            <div className="rounded-3xl border border-border bg-card/40 p-5 md:p-6">
              <h2 className="mb-2 font-display text-lg font-bold">Gerenciar assinatura</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Ao cancelar, a cobrança recorrente é encerrada. O histórico das suas conversas não será apagado.
              </p>
              <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline"><XCircle className="mr-1 size-4" /> Cancelar assinatura</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cancelar assinatura</DialogTitle>
                    <DialogDescription>
                      A cobrança recorrente será encerrada no Mercado Pago. Seu acesso será mantido até {periodEnd ? periodEnd.toLocaleDateString("pt-BR") : "o fim do ciclo atual"}, conforme confirmado pelo Mercado Pago. O histórico das suas conversas não será apagado.
                    </DialogDescription>
                  </DialogHeader>
                  <div>
                    <Label>Motivo (opcional)</Label>
                    <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setCancelOpen(false)}>Voltar</Button>
                    <Button variant="destructive" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>
                      {cancelMut.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                      Confirmar cancelamento
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}
