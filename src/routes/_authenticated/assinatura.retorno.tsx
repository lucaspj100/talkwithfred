import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { refreshMySubscription, getMySubscription } from "@/lib/subscription.functions";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/assinatura/retorno")({
  head: () => ({ meta: [{ title: "Confirmando assinatura — Talk With Fred" }] }),
  component: RetornoPage,
});

function RetornoPage() {
  const refresh = useServerFn(refreshMySubscription);
  const getSub = useServerFn(getMySubscription);
  const navigate = useNavigate();
  const [status, setStatus] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Mercado Pago redirects with ?preapproval_id=... on success.
    const url = new URL(window.location.href);
    const preapprovalId = url.searchParams.get("preapproval_id") ?? undefined;

    async function tick(n: number) {
      if (cancelled || doneRef.current) return;
      try {
        await refresh({ data: preapprovalId ? { preapprovalId } : {} });
        const sub = await getSub();
        if (cancelled) return;
        setStatus(sub?.status ?? null);
        if (sub?.status === "authorized" || sub?.status === "active") {
          doneRef.current = true;
          setTimeout(() => {
            if (!cancelled) void navigate({ to: "/dashboard" });
          }, 1500);
          return;
        }
      } catch {
        // ignore, retry
      }
      setAttempts(n + 1);
      if (n < 10) {
        timer = setTimeout(() => void tick(n + 1), 3000);
      }
    }
    void tick(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh, getSub, navigate]);

  const active = status === "authorized" || status === "active";

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-10 text-center">
      {active ? (
        <>
          <CheckCircle2 className="mb-4 size-14 text-primary" />
          <h1 className="mb-2 font-display text-2xl font-bold">Assinatura confirmada!</h1>
          <p className="text-sm text-muted-foreground">Redirecionando para o painel…</p>
        </>
      ) : (
        <>
          <Loader2 className="mb-4 size-10 animate-spin text-muted-foreground" />
          <h1 className="mb-2 font-display text-2xl font-bold">Confirmando seu pagamento…</h1>
          <p className="text-sm text-muted-foreground">
            Estamos verificando com o Mercado Pago. Isso pode levar alguns segundos.
          </p>
          {attempts >= 10 && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                Ainda não recebemos a confirmação. Você pode acompanhar o status na sua página de assinatura.
              </p>
              <Link to="/assinatura">
                <Button variant="secondary">Ir para minha assinatura</Button>
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
