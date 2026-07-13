import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { getMyProfile } from "@/lib/profile.functions";
import { getAdminMetrics, getAdminUsers, type AdminMetrics, type UserRow, type EngagementStatus } from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminFilters, rangeFor, type Period } from "@/components/admin/AdminFilters";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { LineSeries, BarDistribution, PieDistribution } from "@/components/admin/EngagementChart";
import { ENGAGEMENT_LABELS } from "@/components/admin/EngagementBadge";
import { Users, UserPlus, MessageCircle, Mic, ClipboardCheck, Activity, Sparkles, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  loader: async () => {
    const me = await getMyProfile();
    if (!me.isAdmin) throw redirect({ to: "/dashboard" });
    return { me };
  },
  component: AdminOverview,
});

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

function AdminOverview() {
  const [period, setPeriod] = useState<Period>("30d");
  const [custom, setCustom] = useState({ start: daysAgoStr(29), end: todayStr() });
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const getMetrics = useServerFn(getAdminMetrics);
  const getUsers = useServerFn(getAdminUsers);

  const range = useMemo(() => rangeFor(period, custom), [period, custom]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    Promise.all([
      getMetrics({ data: { start: range.start, end: range.end } }),
      users ? Promise.resolve(users) : getUsers(),
    ])
      .then(([m, u]) => { if (!alive) return; setMetrics(m); setUsers(u); })
      .catch((e) => { if (alive) setErr((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  const statusCounts = useMemo(() => {
    const c: Record<EngagementStatus, number> = { very_active: 0, active: 0, at_risk: 0, inactive: 0, never_activated: 0 };
    for (const u of users ?? []) c[u.engagement_status] = (c[u.engagement_status] ?? 0) + 1;
    return c;
  }, [users]);

  const funnel = useMemo(() => {
    if (!users || !metrics) return [] as { label: string; value: number }[];
    const registered = users.length;
    const onboarded = users.filter((u) => u.onboarding_completed).length;
    const firstConv = users.filter((u) => u.conversations_count >= 1).length;
    const secondActivity = users.filter((u) => (u.conversations_count + u.practice_sessions_count) >= 2).length;
    const active7 = users.filter((u) => u.engagement_status === "active" || u.engagement_status === "very_active").length;
    return [
      { label: "Cadastrados", value: registered },
      { label: "Onboarding", value: onboarded },
      { label: "1ª conversa", value: firstConv },
      { label: "2ª atividade", value: secondActivity },
      { label: "Ativos 7d", value: active7 },
    ];
  }, [users, metrics]);

  const activationRate = metrics && metrics.total_users > 0
    ? Math.round((metrics.onboarded / metrics.total_users) * 100)
    : 0;
  const avgConvsPerActive = metrics && metrics.active_period > 0
    ? (metrics.convs / metrics.active_period).toFixed(1)
    : "0";
  const avgMsgsPerConv = metrics && metrics.convs > 0
    ? (metrics.msgs / metrics.convs).toFixed(1)
    : "0";

  return (
    <AdminShell title="Visão geral">
      <AdminFilters period={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />

      {err && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {err} <button className="underline" onClick={() => setPeriod((p) => p)}>Tentar novamente</button>
        </div>
      )}

      {loading && !metrics ? (
        <SkeletonGrid />
      ) : metrics ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <AdminMetricCard label="Total de usuários" value={metrics.total_users} icon={Users} />
            <AdminMetricCard label="Novos no período" value={metrics.new_users} icon={UserPlus} />
            <AdminMetricCard label="Ativos no período" value={metrics.active_period} icon={Activity} />
            <AdminMetricCard label="Ativos hoje" value={metrics.active_today} icon={Sparkles} />
            <AdminMetricCard label="Onboarding concluído" value={metrics.onboarded} icon={ClipboardCheck} />
            <AdminMetricCard label="Taxa de ativação" value={`${activationRate}%`} icon={Target} hint="Onboarding / total" />
            <AdminMetricCard label="Conversas iniciadas" value={metrics.convs} icon={MessageCircle} />
            <AdminMetricCard label="Mensagens do usuário" value={metrics.msgs} icon={MessageCircle} />
            <AdminMetricCard label="Sessões de prática" value={metrics.practices} icon={ClipboardCheck} />
            <AdminMetricCard label="Minutos de voz" value={Number(metrics.voice_min).toFixed(1)} icon={Mic} />
            <AdminMetricCard label="Conversas / ativo" value={avgConvsPerActive} hint="Média no período" />
            <AdminMetricCard label="Msgs / conversa" value={avgMsgsPerConv} hint="Média no período" />
          </div>

          <h2 className="mt-8 mb-3 font-display text-lg font-semibold">Engajamento</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(statusCounts) as EngagementStatus[]).map((k) => (
              <AdminMetricCard key={k} label={ENGAGEMENT_LABELS[k]} value={statusCounts[k]} />
            ))}
          </div>

          <h2 className="mt-8 mb-3 font-display text-lg font-semibold">Tendências</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <LineSeries title="Novos usuários por dia" data={metrics.new_users_by_day} color="#22c55e" />
            <LineSeries title="Usuários ativos por dia" data={metrics.active_by_day} color="#0ea5e9" />
            <LineSeries title="Conversas iniciadas por dia" data={metrics.convs_by_day} color="#a855f7" />
            <LineSeries title="Mensagens por dia" data={metrics.msgs_by_day} color="#f59e0b" />
            <LineSeries title="Sessões de prática por dia" data={metrics.prac_by_day} color="#14b8a6" />
            <LineSeries title="Minutos de voz por dia" data={metrics.voice_by_day} color="#ef4444" />
          </div>

          <h2 className="mt-8 mb-3 font-display text-lg font-semibold">Distribuições</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <PieDistribution title="Modos de conversa" data={metrics.modes} />
            <PieDistribution title="Nível de inglês" data={metrics.levels} />
            <BarDistribution
              title="Status de engajamento"
              data={(Object.keys(statusCounts) as EngagementStatus[]).map((k) => ({
                label: ENGAGEMENT_LABELS[k], value: statusCounts[k],
              }))}
            />
          </div>

          <h2 className="mt-8 mb-3 font-display text-lg font-semibold">Funil</h2>
          <BarDistribution title="Do cadastro à retenção" data={funnel} />
        </>
      ) : (
        <div className="text-muted-foreground">Sem dados.</div>
      )}
    </AdminShell>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card/30" />
      ))}
    </div>
  );
}
