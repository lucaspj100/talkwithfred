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

const searchSchema = z.object({
  redirect: z.string().optional(),
});

function safeRedirect(target: string | undefined): string {
  if (!target) return "/dashboard";
  try {
    // Only allow same-origin paths
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
    if (data.session) {
      const target = typeof window !== "undefined" ? safeRedirect(search.redirect) : "/dashboard";
      throw redirect({ to: target });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [loading, setLoading] = useState(false);
  const [signupData, setSignupData] = useState({ name: "", email: "", password: "" });
  const [loginData, setLoginData] = useState({ email: "", password: "" });

  const redirectTarget = safeRedirect(search.redirect);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: signupData.email,
      password: signupData.password,
      options: {
        data: { name: signupData.name },
        emailRedirectTo: window.location.origin + redirectTarget,
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada!");
    navigate({ to: "/onboarding" });
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(loginData);
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: redirectTarget });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
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
                <div><Label htmlFor="signup-name">Nome</Label><Input id="signup-name" required value={signupData.name} onChange={(e) => setSignupData({ ...signupData, name: e.target.value })} /></div>
                <div><Label htmlFor="signup-email">E-mail</Label><Input id="signup-email" required type="email" value={signupData.email} onChange={(e) => setSignupData({ ...signupData, email: e.target.value })} /></div>
                <div><Label htmlFor="signup-pw">Senha</Label><Input id="signup-pw" required type="password" minLength={6} value={signupData.password} onChange={(e) => setSignupData({ ...signupData, password: e.target.value })} /></div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Criando..." : "Criar conta"}</Button>
              </form>
            </TabsContent>
            <TabsContent value="login" className="space-y-4 pt-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div><Label>E-mail</Label><Input required type="email" value={loginData.email} onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} /></div>
                <div><Label>Senha</Label><Input required type="password" value={loginData.password} onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} /></div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
