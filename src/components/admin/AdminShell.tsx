import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, Users, Repeat, ClipboardList, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

const NAV = [
  { to: "/admin", label: "Visão geral", icon: BarChart3, exact: true },
  { to: "/admin/users", label: "Usuários", icon: Users, exact: false },
  { to: "/admin/retention", label: "Retenção", icon: Repeat, exact: true },
  { to: "/admin/leads", label: "Leads", icon: ClipboardList, exact: true },
  { to: "/admin/identity", label: "Identidade visual", icon: ImageIcon, exact: true },
] as const;

function titleFromPath(pathname: string): string {
  if (pathname === "/admin" || pathname === "/admin/") return "Visão geral";
  if (pathname.startsWith("/admin/users/")) return "Detalhes do usuário";
  if (pathname === "/admin/users") return "Usuários";
  if (pathname === "/admin/retention") return "Retenção";
  if (pathname === "/admin/leads") return "Leads";
  return "Área administrativa";
}

export function AdminShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = titleFromPath(pathname);

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
            activeOptions={{ exact: n.exact }}
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
