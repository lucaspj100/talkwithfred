import { createFileRoute } from "@tanstack/react-router";
import { getAdminRetention, getAdminUsers, getAdminMetrics } from "@/lib/admin.functions";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { BarDistribution } from "@/components/admin/EngagementChart";

export const Route = createFileRoute("/_authenticated/admin/retention")({
  loader: async () => {
    const start = new Date(); start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const [ret, users, metrics] = await Promise.all([
      getAdminRetention(),
      getAdminUsers(),
      getAdminMetrics({ data: { start: start.toISOString(), end: end.toISOString() } }),
    ]);
    return { ret, users, metrics };
  },
  component: RetentionPage,
});

function RetentionPage() {
  const { ret, users, metrics } = Route.useLoaderData();

  const modes = metrics.modes ?? [];
  const levels = metrics.levels ?? [];

  // Average messages per mode (from users we can't get per-mode msgs easily,
  // so we approximate using conversations counted per mode from `modes` and
  // total messages in the period).
  const totalConv = modes.reduce((a: number, m: { value: number }) => a + m.value, 0);
  const avgMsgsPerConv = totalConv > 0 ? (metrics.msgs / totalConv).toFixed(1) : "0";

  const goalAgg = new Map<string, number>();
  for (const u of users) {
    const g = u.main_goal ?? "—";
    goalAgg.set(g, (goalAgg.get(g) ?? 0) + 1);
  }
  const goals = Array.from(goalAgg.entries()).map(([label, value]) => ({ label, value }));

  return (
    <>

      <p className="mb-4 text-sm text-muted-foreground">
        Retenção D7: usuário que voltou entre o 7º e o 13º dia após sua primeira atividade real.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AdminMetricCard label="Retenção D1" value={ret.d1} hint="Voltaram no dia seguinte" />
        <AdminMetricCard label="Retenção D7" value={ret.d7} hint="Voltaram entre dia 7 e 13" />
        <AdminMetricCard label="Retenção D14" value={ret.d14} hint="Voltaram entre dia 14 e 20" />
        <AdminMetricCard label="Retenção D30" value={ret.d30} hint="Voltaram após 30 dias" />
        <AdminMetricCard label="Total ativados" value={ret.total_activated} hint="Já tiveram 1 atividade" />
        <AdminMetricCard label="Usaram só uma vez" value={ret.one_shot} />
        <AdminMetricCard label="2+ sessões" value={ret.multi} />
        <AdminMetricCard label="Dias ativos / usuário" value={Number(ret.avg_days_active_30d).toFixed(1)} hint="Média nos últimos 30 dias" />
      </div>

      <h2 className="mt-8 mb-3 font-display text-lg font-semibold">Conteúdos mais usados</h2>
      <div className="mb-3 text-xs text-muted-foreground">Média de mensagens por conversa no período: {avgMsgsPerConv}</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <BarDistribution title="Modos de conversa (período)" data={modes} />
        <BarDistribution title="Nível de inglês (base)" data={levels} />
        <BarDistribution title="Objetivos mais comuns" data={goals} />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Assuntos personalizados não são exibidos individualmente para preservar a privacidade.
      </p>
    </>
  );
}
