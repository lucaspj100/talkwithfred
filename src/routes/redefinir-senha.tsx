import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FredBrand } from "@/components/FredBrand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, AlertTriangle } from "lucide-react";
import { translateAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<"loading" | "ok" | "invalid">("loading");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let done = false;
    // Recovery links set a temporary session with PASSWORD_RECOVERY event.
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (done) return;
      setReady(data.session ? "ok" : "invalid");
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady("ok");
      }
    });
    return () => { done = true; sub.subscription.unsubscribe(); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (pw.length < 8) return toast.error("A senha deve ter no mínimo 8 caracteres.");
    if (pw !== confirm) return toast.error("A senha e a confirmação não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setLoading(false);
      return toast.error(translateAuthError(error.message));
    }
    try { await supabase.auth.signOut({ scope: "others" as never }); } catch { /* ignore */ }
    setLoading(false);
    toast.success("Senha alterada com sucesso.");
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="flex px-4 py-10" style={{ minHeight: "100dvh", alignItems: "center", justifyContent: "center", paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><FredBrand linkTo="/" /></div>
        <div className="rounded-2xl border border-border bg-card/70 p-6 shadow-2xl backdrop-blur">
          <h1 className="text-2xl font-semibold text-center">Redefinir senha</h1>

          {ready === "loading" && (
            <p className="mt-4 text-center text-sm text-muted-foreground">Validando link...</p>
          )}

          {ready === "invalid" && (
            <div className="mt-4 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
              <p className="mt-3 text-sm">Este link expirou ou não é mais válido.</p>
              <Button asChild className="mt-6 w-full" style={{ minHeight: 44 }}>
                <Link to="/esqueci-senha">Enviar novo link</Link>
              </Button>
              <Link to="/auth" className="mt-3 inline-block text-sm text-muted-foreground hover:text-foreground">Voltar para o login</Link>
            </div>
          )}

          {ready === "ok" && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="np">Nova senha</Label>
                <div className="relative">
                  <Input id="np" required type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} className="pr-10" style={{ fontSize: "16px" }} />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Ocultar senha" : "Mostrar senha"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
              </div>
              <div>
                <Label htmlFor="np2">Confirmar nova senha</Label>
                <Input id="np2" required type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} style={{ fontSize: "16px" }} />
              </div>
              <Button type="submit" className="w-full" disabled={loading} style={{ minHeight: 44 }}>
                {loading ? "Salvando..." : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
