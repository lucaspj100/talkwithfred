import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { listAllUsers } from "@/lib/admin.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  loader: async () => {
    const me = await getMyProfile();
    if (!me.isAdmin) throw redirect({ to: "/dashboard" });
    const users = await listAllUsers();
    return { users };
  },
  component: AdminPage,
});

function AdminPage() {
  const { users } = Route.useLoaderData();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 size-4" /> Voltar
        </Button>
        <h1 className="font-display text-2xl font-bold">Painel admin</h1>
        <div className="w-24" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card/40">
        <table className="min-w-full text-sm">
          <thead className="border-b border-border bg-card/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Cadastro</th>
              <th className="px-4 py-3">Nível</th>
              <th className="px-4 py-3">Objetivo</th>
              <th className="px-4 py-3">Dificuldade</th>
              <th className="px-4 py-3 text-right">Mensagens</th>
              <th className="px-4 py-3">Último acesso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u: typeof users[number]) => (
              <tr key={u.id} className="hover:bg-accent/20">
                <td className="px-4 py-3 font-medium">{u.name || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-3">{u.english_level ?? "—"}</td>
                <td className="px-4 py-3">{u.main_goal ?? "—"}</td>
                <td className="px-4 py-3">{u.biggest_difficulty ?? "—"}</td>
                <td className="px-4 py-3 text-right">{u.messages_sent}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.last_login ? new Date(u.last_login).toLocaleString("pt-BR") : "—"}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Nenhum usuário ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Para se tornar admin, peça para um admin existente inserir <code className="font-mono">('your-user-id','admin')</code> em <code className="font-mono">user_roles</code>.
      </p>
    </div>
  );
}
