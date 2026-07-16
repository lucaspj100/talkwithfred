import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  getAiCostSummary,
  listAiCostByUser,
  listAiPricing,
  updateFinanceSettings,
  upsertAiPricing,
  type AiCostUserRow,
} from "@/lib/ai-costs.functions";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown, Users, AlertTriangle, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/custos-ia")({
  component: AdminAiCostsPage,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 });
const pct = (n: number) => `${n.toFixed(1)}%`;
const num = (n: number) => n.toLocaleString("pt-BR");

function marginBadge(marginPct: number) {
  if (marginPct >= 50) return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30" variant="outline">Saudável</Badge>;
  if (marginPct >= 30) return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30" variant="outline">Atenção</Badge>;
  if (marginPct >= 0) return <Badge className="bg-orange-500/15 text-orange-500 border-orange-500/30" variant="outline">Risco</Badge>;
  return <Badge className="bg-red-500/15 text-red-500 border-red-500/30" variant="outline">Prejuízo</Badge>;
}

function AdminAiCostsPage() {
  const summaryFn = useServerFn(getAiCostSummary);
  const rowsFn = useServerFn(listAiCostByUser);
  const pricingFn = useServerFn(listAiPricing);

  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const summary = useQuery({
    queryKey: ["admin-ai-cost-summary"],
    queryFn: () => summaryFn({ data: { days: 30 } }),
  });
  const rows = useQuery({
    queryKey: ["admin-ai-cost-rows", { search, onlyActive }],
    queryFn: () => rowsFn({ data: { search, onlyActive, limit: 500 } }),
  });
  const pricing = useQuery({
    queryKey: ["admin-ai-pricing"],
    queryFn: () => pricingFn(),
  });

  const s = summary.data;
  const alerts = useMemo(() => {
    if (!s || !rows.data) return [];
    const list: string[] = [];
    const limit = s.finance.alert_cost_per_user_brl || 15;
    const pctLimit = s.finance.alert_cost_percent_of_revenue || 40;
    for (const r of rows.data) {
      if (r.estimated_cost_brl > limit) {
        list.push(`${r.name || r.email || r.user_id.slice(0, 8)}: custo ${brl(r.estimated_cost_brl)} > limite ${brl(limit)}.`);
      }
      if (r.revenue_brl > 0 && (r.estimated_cost_brl / r.revenue_brl) * 100 > pctLimit) {
        list.push(`${r.name || r.email || r.user_id.slice(0, 8)}: custo é ${pct((r.estimated_cost_brl / r.revenue_brl) * 100)} da receita.`);
      }
    }
    return list.slice(0, 20);
  }, [s, rows.data]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">Custos da IA (mês atual)</h2>
        {summary.isLoading || !s ? (
          <div className="text-muted-foreground">Carregando…</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminMetricCard label="Custo hoje" value={brl(s.total_cost_brl_today)} icon={DollarSign} />
              <AdminMetricCard label="Custo no mês" value={brl(s.total_cost_brl_month)} icon={DollarSign} />
              <AdminMetricCard label="Receita estimada" value={brl(s.revenue_brl_month)} icon={TrendingUp} />
              <AdminMetricCard label="Margem estimada" value={brl(s.margin_brl_month)} icon={s.margin_brl_month >= 0 ? TrendingUp : TrendingDown} />
              <AdminMetricCard label="Assinantes ativos" value={num(s.active_subscribers)} icon={Users} />
              <AdminMetricCard label="Custo médio/assinante" value={brl(s.avg_cost_per_subscriber_brl)} icon={DollarSign} />
              <AdminMetricCard label="Custo / Receita" value={pct(s.cost_percent_of_revenue)} icon={TrendingDown} />
              <AdminMetricCard label="Custo total USD" value={usd(s.total_cost_usd_month)} icon={DollarSign} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>Áudio in: {num(s.input_audio_tokens_month)} tokens</span>
              <span>Áudio out: {num(s.output_audio_tokens_month)} tokens</span>
              <span>Câmbio: 1 USD ≈ {s.finance.usd_brl_rate.toFixed(2)} BRL</span>
              <span>Margem: {pct(s.margin_percent)}</span>
              <span>{marginBadge(s.margin_percent)}</span>
            </div>
          </>
        )}
      </section>

      {alerts.length > 0 && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-amber-500">
            <AlertTriangle className="size-4" />
            <span className="font-medium">Alertas de margem</span>
          </div>
          <ul className="list-disc pl-6 text-sm text-muted-foreground">
            {alerts.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Custo por usuário (mês)</h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input placeholder="Buscar por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
            <label className="flex items-center gap-1 text-sm text-muted-foreground">
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
              Somente ativos
            </label>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Min. usados</TableHead>
                <TableHead className="text-right">Conversas</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-right">Áudio in</TableHead>
                <TableHead className="text-right">Áudio out</TableHead>
                <TableHead className="text-right">Custo USD</TableHead>
                <TableHead className="text-right">Custo BRL</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead>Faixa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.isLoading ? (
                <TableRow><TableCell colSpan={12}>Carregando…</TableCell></TableRow>
              ) : (rows.data ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-muted-foreground">Sem dados no período.</TableCell></TableRow>
              ) : (
                (rows.data as AiCostUserRow[]).map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell>
                      <div className="text-sm">{r.name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    </TableCell>
                    <TableCell>{r.status ?? "—"}</TableCell>
                    <TableCell className="text-right">{num(r.minutes_used)}</TableCell>
                    <TableCell className="text-right">{num(r.conversations_count)}</TableCell>
                    <TableCell>{r.model ?? "—"}</TableCell>
                    <TableCell className="text-right">{num(r.input_audio_tokens)}</TableCell>
                    <TableCell className="text-right">{num(r.output_audio_tokens)}</TableCell>
                    <TableCell className="text-right">{usd(r.estimated_cost_usd)}</TableCell>
                    <TableCell className="text-right">{brl(r.estimated_cost_brl)}</TableCell>
                    <TableCell className="text-right">{brl(r.revenue_brl)}</TableCell>
                    <TableCell className="text-right">{brl(r.margin_brl)} ({pct(r.margin_percent)})</TableCell>
                    <TableCell>{marginBadge(r.margin_percent)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {s && <FinanceSettingsCard initial={s.finance} onSaved={() => summary.refetch()} />}
      <PricingCard rows={pricing.data ?? []} onSaved={() => pricing.refetch()} />

      <section className="rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
        <h3 className="mb-1 font-medium text-foreground">Conferência OpenAI</h3>
        <p>
          Os valores exibidos são estimativas calculadas a partir dos tokens retornados
          pela OpenAI a cada resposta e das tarifas cadastradas. Para o valor financeiro
          oficial, confira o painel de custos ou a Costs API da OpenAI. Pequenas
          diferenças podem ocorrer. Recomenda-se manter um projeto e API key exclusivos
          para o Talk With Fred no painel da OpenAI para permitir a comparação direta
          do custo total do projeto. A integração server-side com o endpoint
          <code className="mx-1 rounded bg-muted px-1">GET /v1/organization/costs</code>
          pode ser habilitada quando o secret <code>OPENAI_ADMIN_KEY</code> for cadastrado.
        </p>
      </section>
    </div>
  );
}

function FinanceSettingsCard({
  initial,
  onSaved,
}: {
  initial: {
    usd_brl_rate: number;
    mercado_pago_fee_percent: number;
    monthly_fixed_cost_brl: number;
    tax_percent: number;
    alert_cost_per_user_brl: number;
    alert_cost_percent_of_revenue: number;
  };
  onSaved: () => void;
}) {
  const [form, setForm] = useState(initial);
  const updateFn = useServerFn(updateFinanceSettings);
  const mut = useMutation({
    mutationFn: () => updateFn({ data: form }),
    onSuccess: () => {
      toast.success("Configurações financeiras atualizadas.");
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message || "Falha ao salvar."),
  });
  const field = (k: keyof typeof form, label: string, step = "0.01") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })}
      />
    </div>
  );
  return (
    <section className="rounded-lg border p-4">
      <h3 className="mb-3 font-medium">Configurações financeiras</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {field("usd_brl_rate", "Câmbio USD → BRL", "0.0001")}
        {field("mercado_pago_fee_percent", "Taxa Mercado Pago (%)")}
        {field("tax_percent", "Impostos (%)")}
        {field("monthly_fixed_cost_brl", "Custo fixo mensal (BRL)")}
        {field("alert_cost_per_user_brl", "Alerta custo/usuário (BRL)")}
        {field("alert_cost_percent_of_revenue", "Alerta custo/receita (%)")}
      </div>
      <div className="mt-3">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} size="sm">
          {mut.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          Salvar
        </Button>
      </div>
    </section>
  );
}

function PricingCard({
  rows,
  onSaved,
}: {
  rows: Array<{
    id: string;
    model: string;
    provider: string;
    input_text_per_million_usd: number;
    cached_input_text_per_million_usd: number;
    output_text_per_million_usd: number;
    input_audio_per_million_usd: number;
    cached_input_audio_per_million_usd: number;
    output_audio_per_million_usd: number;
    effective_from: string;
    source_url: string | null;
  }>;
  onSaved: () => void;
}) {
  const upsertFn = useServerFn(upsertAiPricing);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const mut = useMutation({
    mutationFn: (payload: Parameters<typeof upsertFn>[0]["data"]) => upsertFn({ data: payload }),
    onSuccess: () => { toast.success("Tarifa atualizada."); setEditing(null); onSaved(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section className="rounded-lg border p-4">
      <h3 className="mb-3 font-medium">Tarifas por modelo (USD por 1M tokens)</h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modelo</TableHead>
              <TableHead className="text-right">Texto in</TableHead>
              <TableHead className="text-right">Texto in cache</TableHead>
              <TableHead className="text-right">Texto out</TableHead>
              <TableHead className="text-right">Áudio in</TableHead>
              <TableHead className="text-right">Áudio in cache</TableHead>
              <TableHead className="text-right">Áudio out</TableHead>
              <TableHead>Vigente desde</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const isEdit = editing === r.id;
              const get = (k: string, fallback: number) => (isEdit ? draft[k] ?? fallback : fallback);
              return (
                <TableRow key={r.id}>
                  <TableCell>{r.model}</TableCell>
                  {[
                    ["input_text_per_million_usd", r.input_text_per_million_usd],
                    ["cached_input_text_per_million_usd", r.cached_input_text_per_million_usd],
                    ["output_text_per_million_usd", r.output_text_per_million_usd],
                    ["input_audio_per_million_usd", r.input_audio_per_million_usd],
                    ["cached_input_audio_per_million_usd", r.cached_input_audio_per_million_usd],
                    ["output_audio_per_million_usd", r.output_audio_per_million_usd],
                  ].map(([k, v]) => (
                    <TableCell key={k as string} className="text-right">
                      {isEdit ? (
                        <Input
                          type="number"
                          step="0.001"
                          className="h-8 w-24"
                          value={get(k as string, v as number)}
                          onChange={(e) => setDraft({ ...draft, [k as string]: Number(e.target.value) })}
                        />
                      ) : (
                        (v as number).toFixed(2)
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.effective_from).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>
                    {isEdit ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => mut.mutate({
                            id: r.id,
                            provider: r.provider,
                            model: r.model,
                            input_text_per_million_usd: get("input_text_per_million_usd", r.input_text_per_million_usd),
                            cached_input_text_per_million_usd: get("cached_input_text_per_million_usd", r.cached_input_text_per_million_usd),
                            output_text_per_million_usd: get("output_text_per_million_usd", r.output_text_per_million_usd),
                            input_audio_per_million_usd: get("input_audio_per_million_usd", r.input_audio_per_million_usd),
                            cached_input_audio_per_million_usd: get("cached_input_audio_per_million_usd", r.cached_input_audio_per_million_usd),
                            output_audio_per_million_usd: get("output_audio_per_million_usd", r.output_audio_per_million_usd),
                          })}
                        >
                          Salvar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setDraft({}); }}>Cancelar</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => { setEditing(r.id); setDraft({}); }}>Editar</Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
