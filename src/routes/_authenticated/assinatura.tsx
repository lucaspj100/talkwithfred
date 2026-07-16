import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assinatura")({
  head: () => ({ meta: [{ title: "Minha assinatura — Talk With Fred" }] }),
  component: AssinaturaPage,
});

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "authorized":
    case "active":
      return { label: "Ativa", tone: "ok" as const, help: "Sua assinatura está ativa. Aproveite seus 120 minutos deste ciclo." };
    case "pending":
      return { label: "Aguardando confirmação", tone: "warn" as const, help: "Estamos confirmando seu pagamento. Isso pode levar alguns minutos." };
    case "paused":
      return { label: "Pausada", tone: "warn" as const, help: "Sua assinatura está pausada." };
    case "past_due":
    case "payment_required":
      return { label: "Pagamento pendente", tone: "danger" as const, help: "Regularize o pagamento para continuar usando." };
    case "cancelled":
    case "canceled":
      return { label: "Cancelada", tone: "danger" as const, help: "Sua assinatura foi cancelada." };
    default:
      return { label: "Sem assinatura", tone: "neutral" as const, help: "Assine para começar a praticar." };
  }
}

function AssinaturaPage() {
  const qc = useQueryClient();
  const getSub = useServerFn(getMySubscription);
  const syncFn = useServerFn(syncMySubscription);
  const cancelFn = useServerFn(cancelMySubscription);

  const { data: sub, isLoading } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => getSub(),
  });

  const [cooldownAt, setCooldownAt] = useState<number>(0);
  const now = Date.now();
  const cooldownRemaining = Math.max(0, cooldownAt - now);

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

  const meta = statusLabel(sub?.status);
  const available = Number(sub?.minutes_available ?? 0);
  const used = Number(sub?.minutes_used ?? 0);
  const total = Number(sub?.monthly_minutes ?? 120);
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const active = sub?.status === "authorized" || sub?.status === "active";
  const cancelled = sub?.status === "cancelled";
  const canAccess = active && available > 0;
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end as string) : null;
  const cancelledStillActive = cancelled && periodEnd && periodEnd > new Date();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 font-display text-3xl font-extrabold">Minha assinatura</h1>

      {!sub ? (
        <div className="rounded-3xl border border-border bg-card/60 p-6 text-center">
          <p className="mb-4 text-sm text-muted-foreground">Você ainda não tem uma assinatura.</p>
          <Link to="/planos"><Button className="rounded-full bg-cta text-cta-foreground hover:bg-cta/90">Ver planos</Button></Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-card/60 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <p className={`font-semibold ${
                  meta.tone === "ok" ? "text-primary"
                  : meta.tone === "danger" ? "text-destructive"
                  : meta.tone === "warn" ? "text-amber-500" : ""
                }`}>{meta.label}</p>
              </div>
              <Button variant="ghost" size="sm"
                onClick={() => syncMut.mutate()}
                disabled={syncMut.isPending || cooldownRemaining > 0}>
                <RefreshCw className={`mr-1 size-4 ${syncMut.isPending ? "animate-spin" : ""}`} />
                {cooldownRemaining > 0 ? `Aguarde ${Math.ceil(cooldownRemaining/1000)}s` : "Atualizar status"}
              </Button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">{meta.help}</p>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Plano</p><p>Talk With Fred</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Valor</p><p>R$ 49/mês</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Início do ciclo</p><p>{sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString("pt-BR") : "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Fim do ciclo</p><p>{periodEnd ? periodEnd.toLocaleDateString("pt-BR") : "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Próxima cobrança</p><p>{sub.next_payment_date ? new Date(sub.next_payment_date).toLocaleDateString("pt-BR") : "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Último pagamento</p><p>{sub.last_payment_at ? new Date(sub.last_payment_at).toLocaleDateString("pt-BR") : "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Últ. sincronização</p><p>{sub.last_synced_at ? new Date(sub.last_synced_at as string).toLocaleString("pt-BR") : "—"}</p></div>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card/60 p-6">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-semibold">Minutos disponíveis</p>
              <p className="text-sm text-muted-foreground">{available.toFixed(1)} / {total} min</p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${100 - pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{used.toFixed(1)} min usados neste ciclo.</p>
          </div>

          {cancelled && (
            <div className="rounded-3xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm">
              {cancelledStillActive
                ? <>Sua assinatura foi cancelada. Você tem acesso até {periodEnd?.toLocaleDateString("pt-BR")}.</>
                : <>Seu acesso foi encerrado.</>}
              <div className="mt-3"><Link to="/planos"><Button size="sm" className="rounded-full bg-cta text-cta-foreground hover:bg-cta/90">Assinar novamente</Button></Link></div>
            </div>
          )}

          {!active && !cancelled && (
            <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              {meta.help}
              <div className="mt-3"><Link to="/planos"><Button size="sm" className="rounded-full bg-cta text-cta-foreground hover:bg-cta/90">Regularizar</Button></Link></div>
            </div>
          )}

          {active && !canAccess && (
            <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              Você utilizou todos os 120 minutos deste ciclo. O saldo será renovado na próxima cobrança.
            </div>
          )}

          {(active || sub.status === "past_due" || sub.status === "payment_required" || sub.status === "paused") && (
            <div className="rounded-3xl border border-border bg-card/40 p-6">
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
