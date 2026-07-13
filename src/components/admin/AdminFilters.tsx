import { useMemo } from "react";
import { Button } from "@/components/ui/button";

export type Period = "today" | "7d" | "30d" | "all" | "custom";

export type Range = { start: string; end: string; label: string };

export function rangeFor(period: Period, custom?: { start: string; end: string }): Range {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "today") return { start: start.toISOString(), end: end.toISOString(), label: "Hoje" };
  if (period === "7d") {
    const s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0, 0, 0, 0);
    return { start: s.toISOString(), end: end.toISOString(), label: "Últimos 7 dias" };
  }
  if (period === "30d") {
    const s = new Date(now); s.setDate(s.getDate() - 29); s.setHours(0, 0, 0, 0);
    return { start: s.toISOString(), end: end.toISOString(), label: "Últimos 30 dias" };
  }
  if (period === "custom" && custom) {
    return {
      start: new Date(custom.start + "T00:00:00").toISOString(),
      end: new Date(custom.end + "T23:59:59").toISOString(),
      label: "Personalizado",
    };
  }
  return { start: new Date("2020-01-01").toISOString(), end: end.toISOString(), label: "Todo o período" };
}

export function AdminFilters({
  period,
  onChange,
  custom,
  onCustomChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
  custom: { start: string; end: string };
  onCustomChange: (c: { start: string; end: string }) => void;
}) {
  const opts = useMemo(
    () => [
      { id: "today", label: "Hoje" },
      { id: "7d", label: "7 dias" },
      { id: "30d", label: "30 dias" },
      { id: "all", label: "Tudo" },
      { id: "custom", label: "Personalizado" },
    ] as const,
    [],
  );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {opts.map((o) => (
        <Button
          key={o.id}
          variant={period === o.id ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </Button>
      ))}
      {period === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={custom.start}
            onChange={(e) => onCustomChange({ ...custom, start: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            aria-label="Data inicial"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            value={custom.end}
            onChange={(e) => onCustomChange({ ...custom, end: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            aria-label="Data final"
          />
        </div>
      )}
    </div>
  );
}
