import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  listAdminSubscriptions,
  getAdminSubscriptionMetrics,
  syncAdminSubscriptionsBatch,
  exportAdminSubscriptionsCsv,
} from "@/lib/subscription-admin.functions";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Download, CreditCard, Users, Clock, AlertTriangle, XCircle, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/assinaturas")({
  component: AdminAssinaturasPage,
});

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    authorized: { label: "Ativa", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
    active: { label: "Ativa", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
    pending: { label: "Pendente", className: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
    paused: { label: "Pausada", className: "bg-slate-500/15 text-slate-500 border-slate-500/30" },
    past_due: { label: "Em atraso", className: "bg-red-500/15 text-red-500 border-red-500/30" },
    payment_required: { label: "Em atraso", className: "bg-red-500/15 text-red-500 border-red-500/30" },
    cancelled: { label: "Cancelada", className: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
    canceled: { label: "Cancelada", className: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  };
  const m = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}

function AdminAssinaturasPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all"|"active"|"pending"|"paused"|"cancelled"|"past_due">("all");
  const [balance, setBalance] = useState<"all"|"has_balance"|"no_balance">("all");
  const [sort, setSort] = useState<"created_desc"|"created_asc"|"usage_desc"|"available_asc"|"next_asc">("created_desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const listFn = useServerFn(listAdminSubscriptions);
  const metricsFn = useServerFn(getAdminSubscriptionMetrics);
  const batchFn = useServerFn(syncAdminSubscriptionsBatch);
  const exportFn = useServerFn(exportAdminSubscriptionsCsv);

  const filters = useMemo(
    () => ({ search: search.trim() || undefined, status, balance, page, pageSize, sort }),
    [search, status, balance, page, pageSize, sort],
  );

  const { data: metrics } = useQuery({
    queryKey: ["admin-sub-metrics"],
    queryFn: () => metricsFn(),
  });

  const { data: list, isFetching, refetch } = useQuery({
    queryKey: ["admin-subs", filters],
    queryFn: () => listFn({ data: filters }),
  });

  const batchMut = useMutation({
    mutationFn: (filter: "all"|"pending"|"past_due"|"error") => batchFn({ data: { filter } }),
    onSuccess: (r) => {
      toast.success(`Sincronizadas ${r.synced}/${r.total} (atualizadas ${r.updated}, sem alteração ${r.unchanged}, falhas ${r.failed}).`);
      void refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na sincronização em lote."),
  });

  const exportMut = useMutation({
    mutationFn: () => exportFn({ data: filters }),
    onSuccess: (res) => {
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `assinaturas-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${res.count} registros exportados.`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao exportar."),
  });

  const totalPages = list ? Math.max(1, Math.ceil(list.total / pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <AdminMetricCard label="Total" value={metrics?.total ?? 0} icon={Users} />
        <AdminMetricCard label="Ativas" value={metrics?.active ?? 0} icon={CreditCard} />
        <AdminMetricCard label="Pendentes" value={metrics?.pending ?? 0} icon={Clock} />
        <AdminMetricCard label="Canceladas" value={metrics?.cancelled ?? 0} icon={XCircle} />
        <AdminMetricCard label="Em atraso" value={metrics?.past_due ?? 0} icon={AlertTriangle} />
        <AdminMetricCard label="Sem minutos" value={metrics?.zero_minutes ?? 0} hint="ativas c/ saldo zero" icon={Clock} />
        <AdminMetricCard label="Min. no ciclo" value={Math.round(metrics?.minutes_used_cycle ?? 0)} icon={Clock} />
        <AdminMetricCard label="MRR estimada" value={`R$ ${metrics?.mrr_estimate ?? 0}`} hint="ativas × R$49 (não contábil)" icon={TrendingUp} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/40 p-3">
        <Input placeholder="Buscar por nome, e-mail ou ID MP" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="min-w-[220px] flex-1" />
        <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Ativa</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="paused">Pausada</SelectItem>
            <SelectItem value="past_due">Em atraso</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={balance} onValueChange={(v) => { setBalance(v as typeof balance); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos saldos</SelectItem>
            <SelectItem value="has_balance">Com saldo</SelectItem>
            <SelectItem value="no_balance">Sem saldo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="created_desc">Mais recentes</SelectItem>
            <SelectItem value="created_asc">Mais antigas</SelectItem>
            <SelectItem value="usage_desc">Maior consumo</SelectItem>
            <SelectItem value="available_asc">Menor saldo</SelectItem>
            <SelectItem value="next_asc">Próxima cobrança</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1 size-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
        <Button variant="outline" size="sm"
          onClick={() => batchMut.mutate("pending")}
          disabled={batchMut.isPending}>
          {batchMut.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <RefreshCw className="mr-1 size-4" />}
          Sincronizar pendentes
        </Button>
        <Button variant="outline" size="sm"
          onClick={() => exportMut.mutate()}
          disabled={exportMut.isPending}>
          <Download className="mr-1 size-4" /> CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card/40">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Provedor</TableHead>
              <TableHead className="text-right">Uso</TableHead>
              <TableHead>Próxima cobrança</TableHead>
              <TableHead>Últ. sincronização</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list?.items ?? []).map((row) => {
              const pct = row.monthly_minutes > 0
                ? Math.min(100, Math.round((row.minutes_used / row.monthly_minutes) * 100))
                : 0;
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.user_name || row.user_email || row.user_id.slice(0,8)}</div>
                    <div className="text-xs text-muted-foreground">{row.user_email ?? row.payer_email ?? "—"}</div>
                  </TableCell>
                  <TableCell>
                    {statusBadge(row.status)}
                    {row.provider_status && row.provider_status !== row.status && (
                      <div className="mt-1 text-[10px] text-muted-foreground">MP: {row.provider_status}</div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                    {row.provider_subscription_id ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="text-sm">{row.minutes_used.toFixed(1)} / {row.monthly_minutes}</div>
                    <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-muted ml-auto">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.next_payment_date ? new Date(row.next_payment_date).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.last_synced_at ? new Date(row.last_synced_at).toLocaleString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link to="/admin/assinaturas/$id" params={{ id: row.id }}>
                      <Button variant="ghost" size="sm">Abrir</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
            {!list?.items?.length && !isFetching && (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma assinatura encontrada com esses filtros.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          {list ? `${list.items.length} de ${list.total}` : ""}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
          <span className="text-xs text-muted-foreground">Página {page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      </div>
    </div>
  );
}
