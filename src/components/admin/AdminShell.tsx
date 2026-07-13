import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, Users, Repeat, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

const NAV = [
  { to: "/admin", label: "Visão geral", icon: BarChart3 },
  { to: "/admin/users", label: "Usuários", icon: Users },
  { to: "/admin/retention", label: "Retenção", icon: Repeat },
  { to: "/admin/leads", label: "Leads", icon: ClipboardList },
] as const;

export function AdminShell({ children, title }: { children: ReactNode; title: string }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 size-4" /> Dashboard
        </Button>
        <h1 className="font-display text-xl font-bold sm:text-2xl">{title}</h1>
        <div className="hidden text-xs text-muted-foreground sm:block">Área administrativa</div>
      </div>

      <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/40"
            activeProps={{ className: "rounded-lg px-3 py-2 text-sm bg-accent/60 text-foreground font-medium" }}
            activeOptions={{ exact: n.to === "/admin" }}
          >
            <n.icon className="mr-1 inline size-4" />
            {n.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
