import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { FredBrand } from "@/components/FredBrand";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { translateAuthError } from "@/lib/auth-errors";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

function safeRedirect(target: string | undefined): string {
  if (!target) return "/dashboard";
  try {
    if (target.startsWith("/") && !target.startsWith("//")) return target;
    const u = new URL(target, window.location.origin);
    if (u.origin === window.location.origin) return u.pathname + u.search + u.hash;
  } catch { /* ignore */ }
  return "/dashboard";
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.email_confirmed_at) {
      const target = typeof window !== "undefined" ? safeRedirect(search.redirect) : "/dashboard";
      throw redirect({ to: target });
    }
  },
  component: AuthPage,
});

function PasswordInput({ id, value, onChange, autoComplete, minLength }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: string; minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        required
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        className="pr-10 text-base"
        style={{ fontSize: "16px" }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [loading, setLoading] = useState(false);
  const [signupData, setSignupData] = useState({ name: "", email: "", password: "", confirm: "" });
  const [loginData, setLoginData] = useState({ email: "", password: "", remember: true });
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const redirectTarget = safeRedirect(search.redirect);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const name = signupData.name.trim();
    if (!name) return toast.error("Informe seu nome.");
    if (signupData.password.length < 8) return toast.error("A senha deve ter no mínimo 8 caracteres.");
    if (signupData.password !== signupData.confirm) return toast.error("A senha e a confirmação não coincidem.");

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: signupData.email.trim(),
      password: signupData.password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) return toast.error(translateAuthError(error.message));
    navigate({ to: "/confirmar-email", search: { email: signupData.email.trim() } });
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setNeedsConfirm(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginData.email.trim(),
      password: loginData.password,
    });
    setLoading(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("email not confirmed")) {
        setNeedsConfirm(loginData.email.trim());
        return toast.error("Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada ou reenvie o link.");
      }
      return toast.error(translateAuthError(error.message));
    }
    if (data.user && !data.user.email_confirmed_at) {
      await supabase.auth.signOut();
      setNeedsConfirm(loginData.email.trim());
      return toast.error("Seu e-mail ainda não foi confirmado.");
    }
    navigate({ to: redirectTarget });
  }

  async function handleResend() {
    if (!needsConfirm || resending) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: needsConfirm,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setResending(false);
    if (error) return toast.error(translateAuthError(error.message));
    toast.success("Novo e-mail de confirmação enviado.");
    navigate({ to: "/confirmar-email", search: { email: needsConfirm } });
  }

  return (
    <div className="flex px-4 py-10" style={{ minHeight: "100dvh", alignItems: "center", justifyContent: "center", paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <FredBrand linkTo="/" />
        </div>
        <div className="rounded-2xl border border-border bg-card/70 p-6 shadow-2xl backdrop-blur">
          <Tabs defaultValue="signup">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
              <TabsTrigger value="login">Entrar</TabsTrigger>
            </TabsList>

            <TabsContent value="signup" className="space-y-4 pt-4">
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <Label htmlFor="signup-name">Nome</Label>
                  <Input id="signup-name" required autoComplete="name" value={signupData.name} onChange={(e) => setSignupData({ ...signupData, name: e.target.value })} style={{ fontSize: "16px" }} />
                </div>
                <div>
                  <Label htmlFor="signup-email">E-mail</Label>
                  <Input id="signup-email" required type="email" autoComplete="email" value={signupData.email} onChange={(e) => setSignupData({ ...signupData, email: e.target.value })} style={{ fontSize: "16px" }} />
                </div>
                <div>
                  <Label htmlFor="signup-pw">Senha</Label>
                  <PasswordInput id="signup-pw" value={signupData.password} onChange={(v) => setSignupData({ ...signupData, password: v })} autoComplete="new-password" minLength={8} />
                  <p className="mt-1 text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
                </div>
                <div>
                  <Label htmlFor="signup-confirm">Confirmar senha</Label>
                  <PasswordInput id="signup-confirm" value={signupData.confirm} onChange={(v) => setSignupData({ ...signupData, confirm: v })} autoComplete="new-password" minLength={8} />
                </div>
                <Button type="submit" className="w-full" disabled={loading} style={{ minHeight: 44 }}>
                  {loading ? "Criando..." : "Criar conta"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="login" className="space-y-4 pt-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="login-email">E-mail</Label>
                  <Input id="login-email" required type="email" autoComplete="email" value={loginData.email} onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} style={{ fontSize: "16px" }} />
                </div>
                <div>
                  <Label htmlFor="login-pw">Senha</Label>
                  <PasswordInput id="login-pw" value={loginData.password} onChange={(v) => setLoginData({ ...loginData, password: v })} autoComplete="current-password" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <input type="checkbox" checked={loginData.remember} onChange={(e) => setLoginData({ ...loginData, remember: e.target.checked })} />
                    Lembrar de mim
                  </label>
                  <Link to="/esqueci-senha" className="text-primary hover:underline">Esqueci minha senha</Link>
                </div>
                <Button type="submit" className="w-full" disabled={loading} style={{ minHeight: 44 }}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
                {needsConfirm && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    <p className="text-muted-foreground">Seu e-mail ainda não foi confirmado.</p>
                    <button type="button" onClick={handleResend} disabled={resending} className="mt-2 text-primary hover:underline disabled:opacity-50">
                      {resending ? "Enviando..." : "Reenviar confirmação"}
                    </button>
                  </div>
                )}
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
