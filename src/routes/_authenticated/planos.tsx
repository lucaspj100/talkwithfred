import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createMySubscription, getMySubscription } from "@/lib/subscription.functions";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/planos")({
  head: () => ({
    meta: [
      { title: "Planos — Talk With Fred" },
      { name: "description", content: "Assine o Talk With Fred: 90 minutos de conversação em inglês por mês." },
    ],
  }),
  component: PlanosPage,
});

function PlanosPage() {
  const navigate = useNavigate();
  const getSub = useServerFn(getMySubscription);
  const createSub = useServerFn(createMySubscription);

  const { data: sub } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => getSub(),
  });

  const mutation = useMutation({
    mutationFn: () => createSub(),
    onSuccess: (res) => {
      if ("already_active" in res && res.already_active) {
        toast.success("Sua assinatura já está ativa.");
        void navigate({ to: "/assinatura" });
        return;
      }
      if ("init_point" in res && res.init_point) {
        window.location.href = res.init_point;
        return;
      }
      toast.error("Não foi possível iniciar o checkout.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao criar assinatura.");
    },
  });

  const active = sub?.status === "authorized" || sub?.status === "active";

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 font-display text-3xl font-extrabold">Assine o Talk With Fred</h1>

      <div className="rounded-3xl border border-border bg-card/60 p-6 md:p-8">
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">Plano mensal</p>
          <h2 className="font-display text-2xl font-bold">Talk With Fred</h2>
        </div>

        <div className="mb-6 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold">R$ 49</span>
          <span className="text-muted-foreground">/mês</span>
        </div>

        <ul className="mb-8 space-y-2 text-sm">
          {[
            "90 minutos de conversação por mês",
            "Prática por voz e texto",
            "Correções personalizadas",
            "Histórico de conversas",
            "Renovação mensal automática",
            "Cancele quando quiser",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {active ? (
          <div className="rounded-xl bg-primary/10 p-4 text-sm">
            Sua assinatura já está ativa.{" "}
            <Link to="/assinatura" className="font-medium underline">
              Ver detalhes
            </Link>
          </div>
        ) : (
          <Button
            size="lg"
            className="h-12 w-full rounded-full bg-cta text-base font-semibold text-cta-foreground hover:bg-cta/90"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Preparando checkout…
              </>
            ) : (
              "Assinar Talk With Fred"
            )}
          </Button>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Pagamento processado pelo Mercado Pago. Você pode cancelar a qualquer momento.
        </p>
      </div>
    </div>
  );
}
