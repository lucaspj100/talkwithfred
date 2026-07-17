import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FredBrand } from "@/components/FredBrand";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { getMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallbackPage,
});

type State =
  | { kind: "processing" }
  | { kind: "success" }
  | { kind: "recovery" }
  | { kind: "error"; message: string };

function AuthCallbackPage() {
  const [state, setState] = useState<State>({ kind: "processing" });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      try {
        // Recovery links redirect the user to this callback; we forward to /redefinir-senha.
        const hash = window.location.hash.slice(1);
        const params = new URLSearchParams(hash || window.location.search);
        const type = params.get("type");
        if (type === "recovery") {
          if (!cancelled) setState({ kind: "recovery" });
          setTimeout(() => navigate({ to: "/redefinir-senha" }), 300);
          return;
        }

        // Give Supabase a moment to parse the URL and set the session.
        for (let i = 0; i < 20; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session?.user?.email_confirmed_at) break;
          await new Promise((r) => setTimeout(r, 150));
        }

        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          throw new Error("Não foi possível confirmar seu e-mail. O link pode ter expirado ou já ter sido utilizado.");
        }
        if (!data.user.email_confirmed_at) {
          throw new Error("Não foi possível confirmar seu e-mail. O link pode ter expirado ou já ter sido utilizado.");
        }

        if (cancelled) return;
        setState({ kind: "success" });

        // Decide next destination
        let target: "/onboarding" | "/dashboard" = "/onboarding";
        try {
          const profile = await getMyProfile();
          if (profile.userProfile?.onboarding_completed) target = "/dashboard";
        } catch { /* default to onboarding */ }

        setTimeout(() => { if (!cancelled) navigate({ to: target }); }, 1500);
      } catch (e) {
        if (cancelled) return;
        setState({ kind: "error", message: e instanceof Error ? e.message : "Erro desconhecido." });
      }
    }

    finish();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="flex px-4 py-10" style={{ minHeight: "100dvh", alignItems: "center", justifyContent: "center" }}>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><FredBrand linkTo="/" /></div>
        <div className="rounded-2xl border border-border bg-card/70 p-6 shadow-2xl backdrop-blur text-center">
          {state.kind === "processing" && (
            <>
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">Confirmando seu e-mail...</p>
            </>
          )}
          {state.kind === "recovery" && (
            <>
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">Redirecionando para redefinição de senha...</p>
            </>
          )}
          {state.kind === "success" && (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
              <h1 className="mt-4 text-xl font-semibold">E-mail confirmado com sucesso!</h1>
              <p className="mt-2 text-sm text-muted-foreground">Estamos te redirecionando...</p>
            </>
          )}
          {state.kind === "error" && (
            <>
              <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
              <h1 className="mt-4 text-xl font-semibold">Não foi possível confirmar seu e-mail</h1>
              <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
              <div className="mt-6 space-y-2">
                <Button asChild className="w-full" style={{ minHeight: 44 }}>
                  <Link to="/confirmar-email">Reenviar confirmação</Link>
                </Button>
                <Button asChild variant="outline" className="w-full" style={{ minHeight: 44 }}>
                  <Link to="/auth">Voltar para o login</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
