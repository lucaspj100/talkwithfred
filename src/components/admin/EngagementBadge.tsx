import type { EngagementStatus } from "@/lib/admin.functions";

const MAP: Record<EngagementStatus, { label: string; className: string; symbol: string }> = {
  very_active: { label: "Muito ativo", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", symbol: "★" },
  active: { label: "Ativo", className: "bg-sky-500/20 text-sky-300 border-sky-500/40", symbol: "●" },
  at_risk: { label: "Em risco", className: "bg-amber-500/20 text-amber-300 border-amber-500/40", symbol: "▲" },
  inactive: { label: "Inativo", className: "bg-slate-500/20 text-slate-300 border-slate-500/40", symbol: "◌" },
  never_activated: { label: "Nunca ativado", className: "bg-rose-500/20 text-rose-300 border-rose-500/40", symbol: "✕" },
};

export function EngagementBadge({ status }: { status: EngagementStatus }) {
  const cfg = MAP[status] ?? MAP.inactive;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}
      aria-label={cfg.label}
    >
      <span aria-hidden>{cfg.symbol}</span>
      {cfg.label}
    </span>
  );
}

export const ENGAGEMENT_LABELS: Record<EngagementStatus, string> = {
  very_active: "Muito ativo",
  active: "Ativo",
  at_risk: "Em risco",
  inactive: "Inativo",
  never_activated: "Nunca ativado",
};
