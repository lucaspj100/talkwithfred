import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CreditCard, User, Dumbbell } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMySubscription } from "@/lib/subscription.functions";

/**
 * Persistent mobile bottom nav for authenticated area.
 * Hidden on chat / simulation full-screen routes.
 */
const HIDDEN_PREFIXES = ["/chat/", "/simulacao", "/onboarding"];

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hidden = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  const getSub = useServerFn(getMySubscription);
  const { data: sub } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => getSub(),
    enabled: !hidden,
    staleTime: 30_000,
  });

  if (hidden) return null;

  const alert = subscriptionAlertLevel(sub);

  const items = [
    { to: "/dashboard", label: "Início", icon: Home, exact: true },
    { to: "/practice", label: "Treinos", icon: Dumbbell, exact: false },
    { to: "/assinatura", label: "Assinatura", icon: CreditCard, exact: false, badge: alert },
    { to: "/settings/onboarding", label: "Perfil", icon: User, exact: false },
  ] as const;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegação principal"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {items.map((it) => {
          const Icon = it.icon;
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          return (
            <li key={it.to}>
              <Link
                to={it.to}
                className={`flex flex-col items-center justify-center gap-1 px-2 py-2.5 text-[11px] font-medium transition ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {"badge" in it && it.badge && (
                    <span
                      className={`absolute -right-1.5 -top-1 size-2 rounded-full ${
                        it.badge === "danger" ? "bg-destructive" : "bg-amber-500"
                      }`}
                      aria-hidden
                    />
                  )}
                </span>
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function subscriptionAlertLevel(
  sub: { status?: string | null; minutes_available?: number | string | null } | null | undefined,
): "danger" | "warn" | null {
  if (!sub) return "warn";
  const s = sub.status ?? "";
  if (s === "past_due" || s === "payment_required" || s === "cancelled" || s === "canceled") {
    return "danger";
  }
  if (s === "pending" || s === "paused") return "warn";
  if (s === "authorized" || s === "active") {
    const m = Number(sub.minutes_available ?? 0);
    if (m <= 0) return "danger";
    if (m < 10) return "warn";
  }
  return null;
}
