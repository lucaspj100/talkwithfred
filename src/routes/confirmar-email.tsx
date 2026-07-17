import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FredBrand } from "@/components/FredBrand";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { translateAuthError, webmailUrlFor } from "@/lib/auth-errors";

const searchSchema = z.object({ email: z.string().optional() });

export const Route = createFileRoute("/confirmar-email")({
  ssr: false,
  validateSearch: searchSchema,
  component: ConfirmEmailPage,
});

function ConfirmEmailPage() {
  const { email } = Route.useSearch();
  const navigate = useNavigate();
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user?.email_confirmed_at) {
        navigate({ to: "/dashboard" });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const webmail = email ? webmailUrlFor(email) : null;

  async function handleResend() {
    if (!email || cooldown > 0 || resending) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setResending(false);
    if (error) return toast.error(translateAuthError(error.message));
    toast.success("Novo e-mail de confirmação enviado.");
    setCooldown(60);
  }

  function openMail() {
    if (webmail) window.open(webmail, "_blank", "noopener,noreferrer");
    else window.open("about:blank", "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex px-4 py-10" style={{ minHeight: "100dvh", alignItems: "center", justifyContent: "center", paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><FredBrand linkTo="/" /></div>
        <div className="rounded-2xl border border-border bg-card/70 p-6 shadow-2xl backdrop-blur text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">Confirme seu e-mail</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Enviamos um link de confirmação para:
          </p>
          {email && <p className="mt-1 font-medium break-all">{email}</p>}
          <p className="mt-3 text-sm text-muted-foreground">
            Clique no link recebido para ativar sua conta e começar a conversar com o Fred.
          </p>

          <div className="mt-6 space-y-2">
            <Button onClick={openMail} className="w-full" style={{ minHeight: 44 }}>
              Abrir meu e-mail
            </Button>
            <Button variant="outline" onClick={handleResend} disabled={!email || cooldown > 0 || resending} className="w-full" style={{ minHeight: 44 }}>
              {resending ? "Enviando..." : cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar e-mail"}
            </Button>
            <Link to="/auth" className="inline-block w-full pt-2 text-sm text-muted-foreground hover:text-foreground">
              Voltar para o login
            </Link>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Não encontrou? Verifique a caixa de spam ou lixo eletrônico.
          </p>
        </div>
      </div>
    </div>
  );
}
