import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { getMyProfile } from "@/lib/profile.functions";
import { getAdminUsers, type UserRow, type EngagementStatus } from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin/AdminShell";
import { EngagementBadge, ENGAGEMENT_LABELS } from "@/components/admin/EngagementBadge";
import { Button } from "@/components/ui/button";
import { Download, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  loader: async () => {
    const me = await getMyProfile();
    if (!me.isAdmin) throw redirect({ to: "/dashboard" });
    const users = await getAdminUsers();
    return { users };
  },
  component: AdminUsersPage,
});

type SortKey = "created_at" | "last_activity_at" | "conversations_count" | "messages_count" | "xp";

function fmt(d: string | null) { return d ? new Date(d).toLocaleDateString("pt-BR") : "—"; }
function fmtDT(d: string | null) { return d ? new Date(d).toLocaleString("pt-BR") : "—"; }

const PAGE_SIZE = 25;

function AdminUsersPage() {
  const { users } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<EngagementStatus | "all">("all");
  const [level, setLevel] = useState<string>("all");
  const [onb, setOnb] = useState<"all" | "yes" | "no">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<SortKey>("last_activity_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const levels = useMemo(() => {
    const s = new Set<string>();
    for (const u of users as UserRow[]) if (u.english_level) s.add(u.english_level);
    return Array.from(s);
  }, [users]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = users.filter((u: UserRow) => {
      if (term && !((u.name ?? "").toLowerCase().includes(term) || (u.email ?? "").toLowerCase().includes(term))) return false;
      if (status !== "all" && u.engagement_status !== status) return false;
      if (level !== "all" && u.english_level !== level) return false;
      if (onb === "yes" && !u.onboarding_completed) return false;
      if (onb === "no" && u.onboarding_completed) return false;
      if (fromDate && new Date(u.created_at) < new Date(fromDate)) return false;
      if (toDate && new Date(u.created_at) > new Date(toDate + "T23:59:59")) return false;
      return true;
    });
    list = [...list].sort((a: UserRow, b: UserRow) => {
      const av = (a[sort] ?? 0) as number | string;
      const bv = (b[sort] ?? 0) as number | string;
      const cmp = av > bv ? 1 : av < bv ? -1 : 0;
      return dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [users, q, status, level, onb, fromDate, toDate, sort, dir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(k: SortKey) {
    if (sort === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(k); setDir("desc"); }
  }

  function exportCsv() {
    const headers = ["nome", "email", "cadastro", "onboarding", "nivel", "ultimo_login", "ultima_atividade", "conversas", "mensagens", "praticas", "voz_min", "xp", "streak", "maior_streak", "status"];
    const rows = filtered.map((u: UserRow) => [
      u.name ?? "", u.email ?? "", u.created_at, u.onboarding_completed ? "sim" : "nao", u.english_level ?? "",
      u.last_login ?? "", u.last_activity_at ?? "", u.conversations_count, u.messages_count, u.practice_sessions_count,
      Number(u.voice_minutes_total).toFixed(2), u.xp, u.streak_days, u.longest_streak, u.engagement_status,
    ]);
    const csv = [headers, ...rows].map((r: (string | number)[]) => r.map((v: string | number) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell title="Usuários">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Buscar nome ou e-mail"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm"
          />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value as EngagementStatus | "all"); setPage(1); }}
          className="rounded-md border border-border bg-background px-2 py-2 text-sm">
          <option value="all">Todos os status</option>
          {(["very_active", "active", "at_risk", "inactive", "never_activated"] as const).map((s) => (
            <option key={s} value={s}>{ENGAGEMENT_LABELS[s]}</option>
          ))}
        </select>
        <select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}
          className="rounded-md border border-border bg-background px-2 py-2 text-sm">
          <option value="all">Todos os níveis</option>
          {levels.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={onb} onChange={(e) => { setOnb(e.target.value as "all" | "yes" | "no"); setPage(1); }}
          className="rounded-md border border-border bg-background px-2 py-2 text-sm">
          <option value="all">Onboarding: todos</option>
          <option value="yes">Concluído</option>
          <option value="no">Incompleto</option>
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-2 text-sm" aria-label="Cadastro desde" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-2 text-sm" aria-label="Cadastro até" />
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1 size-4" /> CSV
        </Button>
      </div>

      <div className="mb-2 text-xs text-muted-foreground">{filtered.length} usuário(s)</div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card/40 md:block">
        <table className="min-w-full text-sm">
          <thead className="border-b border-border bg-card/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Nome / e-mail</th>
              <th className="px-3 py-3 cursor-pointer" onClick={() => toggleSort("created_at")}>Cadastro</th>
              <th className="px-3 py-3">Nível</th>
              <th className="px-3 py-3">Objetivo</th>
              <th className="px-3 py-3 cursor-pointer" onClick={() => toggleSort("last_activity_at")}>Última atividade</th>
              <th className="px-3 py-3 text-right cursor-pointer" onClick={() => toggleSort("conversations_count")}>Conv.</th>
              <th className="px-3 py-3 text-right cursor-pointer" onClick={() => toggleSort("messages_count")}>Msgs</th>
              <th className="px-3 py-3 text-right">Prática</th>
              <th className="px-3 py-3 text-right">Voz(min)</th>
              <th className="px-3 py-3 text-right cursor-pointer" onClick={() => toggleSort("xp")}>XP</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pageItems.map((u: UserRow) => (
              <tr key={u.user_id} className="hover:bg-accent/20">
                <td className="px-3 py-3">
                  <Link to="/admin/users/$userId" params={{ userId: u.user_id }} className="font-medium hover:underline">
                    {u.name || "—"}
                  </Link>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{fmt(u.created_at)}</td>
                <td className="px-3 py-3">{u.english_level ?? "—"}</td>
                <td className="px-3 py-3">{u.main_goal ?? "—"}</td>
                <td className="px-3 py-3 text-muted-foreground">{fmtDT(u.last_activity_at)}</td>
                <td className="px-3 py-3 text-right">{u.conversations_count}</td>
                <td className="px-3 py-3 text-right">{u.messages_count}</td>
                <td className="px-3 py-3 text-right">{u.practice_sessions_count}</td>
                <td className="px-3 py-3 text-right">{Number(u.voice_minutes_total).toFixed(1)}</td>
                <td className="px-3 py-3 text-right">{u.xp}</td>
                <td className="px-3 py-3"><EngagementBadge status={u.engagement_status} /></td>
              </tr>
            ))}
            {pageItems.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {pageItems.map((u: UserRow) => (
          <Link key={u.user_id} to="/admin/users/$userId" params={{ userId: u.user_id }}
            className="rounded-2xl border border-border bg-card/40 p-4 hover:bg-accent/20">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{u.name || "—"}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              <EngagementBadge status={u.engagement_status} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Cadastro: </span>{fmt(u.created_at)}</div>
              <div><span className="text-muted-foreground">Nível: </span>{u.english_level ?? "—"}</div>
              <div><span className="text-muted-foreground">Conv.: </span>{u.conversations_count}</div>
              <div><span className="text-muted-foreground">Msgs: </span>{u.messages_count}</div>
              <div><span className="text-muted-foreground">Voz: </span>{Number(u.voice_minutes_total).toFixed(1)}m</div>
              <div><span className="text-muted-foreground">XP: </span>{u.xp}</div>
            </div>
          </Link>
        ))}
        {pageItems.length === 0 && (
          <div className="rounded-2xl border border-border bg-card/40 p-8 text-center text-muted-foreground">Nenhum usuário encontrado.</div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="text-muted-foreground">Página {page} de {totalPages}</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima</Button>
        </div>
      </div>
    </AdminShell>
  );
}
