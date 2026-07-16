import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getAdminSubscriptionDetail,
  syncAdminSubscription,
  adjustAdminSubscriptionMinutes,
  cancelAdminSubscription,
} from "@/lib/subscription-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, RefreshCw, Loader2, XCircle, PlusCircle, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/assinaturas/$id")({
  component: AdminAssinaturaDetail,
});

function fmt(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString("pt-BR") : "—";
}

function AdminAssinaturaDetail() {
  const { id } = useParams({ from: "/_authenticated/admin/assinaturas/$id" });
  const qc = useQueryClient();
  const getDetail = useServerFn(getAdminSubscriptionDetail);
  const syncFn = useServerFn(syncAdminSubscription);
  const adjustFn = useServerFn(adjustAdminSubscriptionMinutes);
  const cancelFn = useServerFn(cancelAdminSubscription);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-sub", id],
    queryFn: () => getDetail({ data: { id } }),
  });

  const syncMut = useMutation({
    mutationFn: () => syncFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(r.ok ? `Sincronizado. Status: ${r.new_status ?? "—"}` : `Falha: ${r.error}`);
      void qc.invalidateQueries({ queryKey: ["admin-sub", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro."),
  });

  // Adjust minutes state
  const [op, setOp] = useState<"add"|"remove"|"set">("add");
  const [minutes, setMinutes] = useState<string>("");
  const [reason, setReason] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);

  const adjustMut = useMutation({
    mutationFn: () => adjustFn({ data: {
      id,
      operation: op,
      minutes: Number(minutes || 0),
      reason: reason.trim(),
    } }),
    onSuccess: () => {
      toast.success("Ajuste aplicado.");
      setAdjustOpen(false);
      setMinutes(""); setReason("");
      void qc.invalidateQueries({ queryKey: ["admin-sub", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao ajustar."),
  });

  // Cancel state
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancelMut = useMutation({
    mutationFn: () => cancelFn({ data: { id, reason: cancelReason.trim() } }),
    onSuccess: () => {
      toast.success("Assinatura cancelada no Mercado Pago.");
      setCancelOpen(false); setCancelReason("");
      void qc.invalidateQueries({ queryKey: ["admin-sub", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao cancelar."),
  });

  if (isLoading || !data) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  const s = data.subscription as Record<string, unknown>;
  const profile = data.profile as { name?: string | null; email?: string | null } | null;
  const used = Number(s.minutes_used ?? 0);
  const monthly = Number(s.monthly_minutes ?? 120);
  const available = Number(s.minutes_available ?? 0);
  const pct = monthly > 0 ? Math.min(100, Math.round((used / monthly) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link to="/admin/assinaturas"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 size-4" /> Voltar</Button></Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            {syncMut.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <RefreshCw className="mr-1 size-4" />}
            Sincronizar com Mercado Pago
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card/40 p-4 md:col-span-2">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Assinatura</div>
          <div className="font-display text-xl font-bold">{profile?.name || profile?.email || (s.user_id as string)?.slice(0,8)}</div>
          <div className="text-sm text-muted-foreground">{profile?.email ?? (s.payer_email as string) ?? "—"}</div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <div><div className="text-xs text-muted-foreground">Status local</div><div className="font-medium">{s.status as string}</div></div>
            <div><div className="text-xs text-muted-foreground">Status no MP</div><div className="font-medium">{(s.provider_status as string) ?? "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Plano</div><div>{(s.plan_name as string) ?? "Talk With Fred"}</div></div>
            <div><div className="text-xs text-muted-foreground">Valor</div><div>R$ 49/mês</div></div>
            <div><div className="text-xs text-muted-foreground">Provider ID</div><div className="truncate text-xs">{(s.provider_subscription_id as string) ?? "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Plan ID</div><div className="truncate text-xs">{(s.provider_plan_id as string) ?? "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Início do ciclo</div><div>{fmt(s.current_period_start as string)}</div></div>
            <div><div className="text-xs text-muted-foreground">Fim do ciclo</div><div>{fmt(s.current_period_end as string)}</div></div>
            <div><div className="text-xs text-muted-foreground">Próxima cobrança</div><div>{fmt(s.next_payment_date as string)}</div></div>
            <div><div className="text-xs text-muted-foreground">Último pagamento</div><div>{fmt(s.last_payment_at as string)}</div></div>
            <div><div className="text-xs text-muted-foreground">Cancelada em</div><div>{fmt(s.canceled_at as string)}</div></div>
            <div><div className="text-xs text-muted-foreground">Últ. sincronização</div><div>{fmt(s.last_synced_at as string)}</div></div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/40 p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Minutos</div>
          <div className="text-2xl font-extrabold">{available.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">/ {monthly}</span></div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${100 - pct}%` }} />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">{used.toFixed(1)} min usados</div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><PlusCircle className="mr-1 size-4" /> Ajustar minutos</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajustar minutos</DialogTitle>
                  <DialogDescription>
                    Este ajuste não altera o Mercado Pago nem a data de renovação. Toda alteração é auditada.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Operação</Label>
                    <Select value={op} onValueChange={(v) => setOp(v as typeof op)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="add">Adicionar minutos</SelectItem>
                        <SelectItem value="remove">Remover minutos</SelectItem>
                        <SelectItem value="set">Definir saldo exato</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Minutos</Label>
                    <Input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                  </div>
                  <div>
                    <Label>Motivo (obrigatório)</Label>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
                  <Button onClick={() => adjustMut.mutate()} disabled={adjustMut.isPending || !minutes || reason.trim().length < 3}>
                    {adjustMut.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                    <Save className="mr-1 size-4" /> Confirmar ajuste
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm"><XCircle className="mr-1 size-4" /> Cancelar</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancelar assinatura</DialogTitle>
                  <DialogDescription>
                    Esta ação envia o cancelamento para o Mercado Pago. O histórico não será apagado.
                  </DialogDescription>
                </DialogHeader>
                <div>
                  <Label>Motivo (obrigatório)</Label>
                  <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} />
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setCancelOpen(false)}>Voltar</Button>
                  <Button variant="destructive" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending || cancelReason.trim().length < 3}>
                    {cancelMut.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                    Confirmar cancelamento
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card/40 p-4">
        <h2 className="mb-3 font-display text-lg font-bold">Histórico de auditoria</h2>
        <div className="max-h-[400px] space-y-2 overflow-y-auto text-sm">
          {(data.audit ?? []).map((a) => {
            const r = a as Record<string, unknown>;
            return (
              <div key={r.id as string} className="rounded-lg border border-border/60 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{r.action as string}</div>
                  <div className="text-xs text-muted-foreground">{fmt(r.created_at as string)} • {r.actor_type as string}</div>
                </div>
                {r.reason ? <div className="mt-1 text-xs text-muted-foreground">Motivo: {r.reason as string}</div> : null}
                {r.provider_reference ? <div className="text-[10px] text-muted-foreground">Ref: {r.provider_reference as string}</div> : null}
              </div>
            );
          })}
          {!data.audit?.length && <div className="text-sm text-muted-foreground">Sem registros.</div>}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card/40 p-4">
        <h2 className="mb-3 font-display text-lg font-bold">Eventos do Mercado Pago</h2>
        <div className="max-h-[300px] space-y-2 overflow-y-auto text-sm">
          {(data.events ?? []).map((e) => {
            const r = e as Record<string, unknown>;
            return (
              <div key={r.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-2">
                <div>
                  <div className="font-medium">{(r.event_type as string) ?? "evento"}</div>
                  <div className="text-xs text-muted-foreground">{(r.provider_event_id as string) ?? "—"}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmt(r.created_at as string)}
                  {r.processed ? " • processado" : " • pendente"}
                </div>
              </div>
            );
          })}
          {!data.events?.length && <div className="text-sm text-muted-foreground">Sem eventos.</div>}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card/40 p-4">
        <h2 className="mb-3 font-display text-lg font-bold">Sessões de uso</h2>
        <div className="max-h-[300px] space-y-2 overflow-y-auto text-sm">
          {(data.sessions ?? []).map((se) => {
            const r = se as Record<string, unknown>;
            const secs = Number(r.seconds_used ?? 0);
            return (
              <div key={r.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-2">
                <div>
                  <div className="font-medium capitalize">{(r.mode as string) ?? "—"} • {(r.status as string) ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{fmt(r.started_at as string)} → {fmt(r.ended_at as string)}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {(secs / 60).toFixed(1)} min {r.close_reason ? `• ${r.close_reason as string}` : ""}
                </div>
              </div>
            );
          })}
          {!data.sessions?.length && <div className="text-sm text-muted-foreground">Sem sessões.</div>}
        </div>
      </section>
    </div>
  );
}
