import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listLeads,
  updateLeadStatus,
  LEAD_STATUSES,
  type AdminLead,
  type LeadStatus,
} from "@/lib/leads.functions";
import {
  AREAS,
  LEVELS,
  labelArea,
  labelGoalSim,
  labelLevelSim,
  labelBlock,
  labelLostOpp,
} from "@/lib/simulation-options";
import { Download, MessageCircle, Search, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/leads")({
  loader: async () => {
    const leads = await listLeads();
    return { leads };
  },
  component: AdminLeadsPage,
});


function statusLabel(v: string) {
  return LEAD_STATUSES.find((s) => s.value === v)?.label ?? v;
}

function areasText(lead: AdminLead): string {
  const list = lead.areas.map((v) => (v === "other" ? (lead.other_area || "Outra") : labelArea(v))).filter(Boolean);
  if (list.length === 0 && lead.area) list.push(labelArea(lead.area) || lead.area);
  return list.join(", ");
}

function waHref(lead: AdminLead): string | null {
  const raw = (lead.whatsapp || "").replace(/\D/g, "");
  if (!raw) return null;
  const msg = encodeURIComponent(
    `Oi, ${lead.name.split(" ")[0]}. Tudo bem? Vi que você fez seu Mapa de Oportunidades com Inglês e queria te ajudar a interpretar seu resultado. Faz sentido conversarmos rapidinho?`,
  );
  return `https://wa.me/${raw}?text=${msg}`;
}

function exportCsv(rows: AdminLead[]) {
  const headers = [
    "Nome", "Email", "WhatsApp", "Áreas", "Objetivo", "Nível",
    "Trava", "Perdeu oportunidade", "Status", "Origem", "Criado em", "Resumo simulação",
  ];
  const csv = [headers.join(",")].concat(
    rows.map((l) => [
      l.name, l.email, l.whatsapp ?? "",
      areasText(l),
      labelGoalSim(l.goal) || "",
      labelLevelSim(l.level) || "",
      labelBlock(l.main_block) || "",
      labelLostOpp(l.already_lost_opportunity) || "",
      statusLabel(l.status),
      l.source,
      new Date(l.created_at).toLocaleString("pt-BR"),
      (l.simulation_summary || "").replace(/\s+/g, " "),
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
  ).join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function AdminLeadsPage() {
  const { leads: initial } = Route.useLoaderData();
  const update = useServerFn(updateLeadStatus);
  const [leads, setLeads] = useState<AdminLead[]>(initial);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState<string>("");
  const [fArea, setFArea] = useState<string>("");
  const [fLevel, setFLevel] = useState<string>("");
  const [selected, setSelected] = useState<AdminLead | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (fStatus && l.status !== fStatus) return false;
      if (fArea && !l.areas.includes(fArea) && l.area !== fArea) return false;
      if (fLevel && l.level !== fLevel) return false;
      if (!term) return true;
      return (
        l.name.toLowerCase().includes(term) ||
        l.email.toLowerCase().includes(term) ||
        (l.whatsapp || "").toLowerCase().includes(term)
      );
    });
  }, [leads, q, fStatus, fArea, fLevel]);

  async function changeStatus(leadId: string, status: LeadStatus) {
    const prev = leads;
    setLeads((rows) => rows.map((r) => (r.id === leadId ? { ...r, status } : r)));
    try {
      await update({ data: { leadId, status } });
      toast.success("Status atualizado");
    } catch (e) {
      setLeads(prev);
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-end gap-4">
        <Button variant="outline" onClick={() => exportCsv(filtered)}>
          <Download className="mr-1 size-4" /> Exportar CSV
        </Button>
      </div>


      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar nome, email ou WhatsApp"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Todos os status</option>
          {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          value={fArea}
          onChange={(e) => setFArea(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Todas as áreas</option>
          {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <select
          value={fLevel}
          onChange={(e) => setFLevel(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Todos os níveis</option>
          {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card/40">
        <table className="min-w-full text-sm">
          <thead className="border-b border-border bg-card/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Nome</th>
              <th className="px-3 py-3">Contato</th>
              <th className="px-3 py-3">Áreas</th>
              <th className="px-3 py-3">Objetivo</th>
              <th className="px-3 py-3">Nível</th>
              <th className="px-3 py-3">Trava</th>
              <th className="px-3 py-3">Perdeu oport.</th>
              <th className="px-3 py-3">Origem</th>
              <th className="px-3 py-3">Data</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((l) => {
              const wa = waHref(l);
              return (
                <tr key={l.id} className="cursor-pointer hover:bg-accent/20" onClick={() => setSelected(l)}>
                  <td className="px-3 py-3 font-medium">{l.name}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    <div>{l.email}</div>
                    {l.whatsapp && <div className="text-xs">{l.whatsapp}</div>}
                  </td>
                  <td className="px-3 py-3">{areasText(l) || "—"}</td>
                  <td className="px-3 py-3">{labelGoalSim(l.goal) || "—"}</td>
                  <td className="px-3 py-3">{labelLevelSim(l.level) || "—"}</td>
                  <td className="px-3 py-3">{labelBlock(l.main_block) || "—"}</td>
                  <td className="px-3 py-3">{labelLostOpp(l.already_lost_opportunity) || "—"}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{l.source}</td>
                  <td className="px-3 py-3 text-muted-foreground text-xs">
                    {new Date(l.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={l.status}
                      onChange={(e) => changeStatus(l.id, e.target.value as LeadStatus)}
                      className="rounded border border-border bg-background px-2 py-1 text-xs"
                    >
                      {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    {wa ? (
                      <a href={wa} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="secondary">
                          <MessageCircle className="mr-1 size-3" /> WhatsApp
                        </Button>
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">sem WhatsApp</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Nenhum lead encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">{selected.name}</h2>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid gap-3 text-sm">
              <Row k="Email" v={selected.email} />
              <Row k="WhatsApp" v={selected.whatsapp || "—"} />
              <Row k="Áreas" v={areasText(selected) || "—"} />
              <Row k="Objetivo" v={labelGoalSim(selected.goal) || "—"} />
              <Row k="Nível" v={labelLevelSim(selected.level) || "—"} />
              <Row k="Trava" v={labelBlock(selected.main_block) || "—"} />
              <Row k="Perdeu oportunidade" v={labelLostOpp(selected.already_lost_opportunity) || "—"} />
              <Row k="Status" v={statusLabel(selected.status)} />
              <Row k="Origem" v={selected.source} />
              <Row k="Criado em" v={new Date(selected.created_at).toLocaleString("pt-BR")} />
              {selected.simulation_summary && (
                <div>
                  <div className="mb-1 text-xs uppercase text-muted-foreground">Resumo da simulação</div>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs">
                    {selected.simulation_summary}
                  </pre>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              {waHref(selected) && (
                <a href={waHref(selected)!} target="_blank" rel="noopener noreferrer">
                  <Button><MessageCircle className="mr-1 size-4" /> Chamar no WhatsApp</Button>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
