import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FredBrand } from "@/components/FredBrand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/esqueci-senha")({
  ssr: false,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    // Fire and (intentionally) do not reveal whether the account exists.
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setLoading(false);
    setSent(true);
    toast.success("Se existir uma conta com este e-mail, enviaremos um link de recuperação.");
  }

  return (
    <div className="flex px-4 py-10" style={{ minHeight: "100dvh", alignItems: "center", justifyContent: "center", paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><FredBrand linkTo="/" /></div>
        <div className="rounded-2xl border border-border bg-card/70 p-6 shadow-2xl backdrop-blur">
          <h1 className="text-2xl font-semibold text-center">Recuperar senha</h1>
          {!sent ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground text-center">
                Digite seu e-mail e enviaremos um link para você criar uma nova senha.
              </p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="fp-email">E-mail</Label>
                  <Input id="fp-email" required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ fontSize: "16px" }} />
                </div>
                <Button type="submit" className="w-full" disabled={loading} style={{ minHeight: 44 }}>
                  {loading ? "Enviando..." : "Enviar link de recuperação"}
                </Button>
              </form>
            </>
          ) : (
            <div className="mt-4 space-y-4 text-center">
              <p className="text-sm">
                Se existir uma conta com este e-mail, enviaremos um link de recuperação para <span className="font-medium break-all">{email}</span>.
              </p>
              <p className="text-xs text-muted-foreground">
                Não encontrou? Verifique a caixa de spam ou lixo eletrônico.
              </p>
            </div>
          )}
          <div className="mt-6 text-center">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Voltar para o login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
