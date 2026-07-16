import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMySubscription } from "@/lib/subscription.functions";
import { Button } from "@/components/ui/button";
import { CreditCard, ArrowRight, AlertTriangle, Clock } from "lucide-react";

/**
 * Compact "Seu plano" card for the dashboard.
 * Represents subscription state honestly — never shows minutes as usable when
 * status is not active/authorized.
 */
export function SubscriptionSummaryCard() {
  const getSub = useServerFn(getMySubscription);
  const { data: sub, isLoading } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => getSub(),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="mt-6 h-24 animate-pulse rounded-2xl border border-border bg-card/40" />
    );
  }

  const status = sub?.status ?? null;
  const active = status === "authorized" || status === "active";
  const available = Number(sub?.minutes_available ?? 0);
  const total = Number(sub?.monthly_minutes ?? 90);
  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end as string)
    : null;

  // No subscription at all
  if (!sub) {
    return (
      <Card
        tone="warn"
        icon={<CreditCard className="size-5" />}
        title="Seu plano"
        subtitle="Assine para conversar com Fred."
        action={{ to: "/planos", label: "Ver planos" }}
      />
    );
  }

  if (status === "pending") {
    return (
      <Card
        tone="warn"
        icon={<Clock className="size-5" />}
        title="Pagamento pendente"
        subtitle="Estamos confirmando sua assinatura."
        action={{ to: "/assinatura", label: "Verificar pagamento" }}
      />
    );
  }

  if (status === "past_due" || status === "payment_required") {
    return (
      <Card
        tone="danger"
        icon={<AlertTriangle className="size-5" />}
        title="Pagamento não confirmado"
        subtitle="Regularize para continuar usando o Fred."
        action={{ to: "/assinatura", label: "Regularizar pagamento" }}
      />
    );
  }

  if (status === "paused") {
    return (
      <Card
        tone="warn"
        icon={<AlertTriangle className="size-5" />}
        title="Assinatura pausada"
        subtitle="Regularize sua assinatura para voltar a praticar."
        action={{ to: "/assinatura", label: "Ver assinatura" }}
      />
    );
  }

  if (status === "cancelled" || status === "canceled") {
    const stillActive = periodEnd && periodEnd > new Date();
    return (
      <Card
        tone="danger"
        icon={<AlertTriangle className="size-5" />}
        title="Assinatura cancelada"
        subtitle={
          stillActive
            ? `Acesso até ${periodEnd?.toLocaleDateString("pt-BR")}.`
            : "Seu acesso foi encerrado."
        }
        action={{ to: "/planos", label: "Assinar novamente" }}
      />
    );
  }

  // Active / authorized
  if (active) {
    const pct = total > 0 ? Math.min(100, Math.max(0, (available / total) * 100)) : 0;
    const zero = available <= 0;
    const low = available > 0 && available < 10;

    return (
      <div className="mt-6 rounded-2xl border border-border bg-card/60 p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Seu plano</p>
            <p className="mt-0.5 font-display text-base font-bold md:text-lg">Talk With Fred</p>
          </div>
          <Link to="/assinatura" className="shrink-0">
            <Button size="sm" variant="outline" className="rounded-full">
              Ver assinatura <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </Link>
        </div>

        <div className="mt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className={`font-semibold ${zero ? "text-destructive" : low ? "text-amber-500" : ""}`}>
              {zero
                ? "0 minutos"
                : `${available.toFixed(0)} de ${total} min disponíveis`}
            </span>
            {periodEnd && (
              <span className="text-xs text-muted-foreground">
                Próx. cobrança {periodEnd.toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                zero ? "bg-destructive" : low ? "bg-amber-500" : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {zero && (
            <p className="mt-2 text-xs text-muted-foreground">
              Seu saldo será renovado na próxima cobrança.
            </p>
          )}
          {low && !zero && (
            <p className="mt-2 text-xs text-amber-500/90">
              Restam poucos minutos neste ciclo.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card
      tone="neutral"
      icon={<CreditCard className="size-5" />}
      title="Seu plano"
      subtitle="Consulte o status da sua assinatura."
      action={{ to: "/assinatura", label: "Ver assinatura" }}
    />
  );
}

function Card({
  tone,
  icon,
  title,
  subtitle,
  action,
}: {
  tone: "warn" | "danger" | "neutral";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action: { to: string; label: string };
}) {
  const border =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/10"
      : tone === "warn"
      ? "border-amber-500/40 bg-amber-500/10"
      : "border-border bg-card/60";
  const iconTone =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-500" : "text-primary";
  return (
    <div className={`mt-6 rounded-2xl border p-4 md:p-5 ${border}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`grid size-9 shrink-0 place-items-center rounded-xl bg-background/60 ${iconTone}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold">{title}</p>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <Link to={action.to} className="shrink-0">
          <Button size="sm" className="rounded-full">
            {action.label}
          </Button>
        </Link>
      </div>
    </div>
  );
}
