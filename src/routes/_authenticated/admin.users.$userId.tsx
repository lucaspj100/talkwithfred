import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getMyProfile } from "@/lib/profile.functions";
import { getAdminUserDetail, type ActivityEvent } from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { ArrowLeft, MessageCircle, Mic, ClipboardCheck, Flame, Zap, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  loader: async ({ params }) => {
    const me = await getMyProfile();
    if (!me.isAdmin) throw redirect({ to: "/dashboard" });
    const detail = await getAdminUserDetail({ data: { userId: params.userId } });
    return { detail };
  },
  component: UserDetailPage,
});

function KindLabel(kind: string) {
  switch (kind) {
    case "conversation": return "Conversa iniciada";
    case "practice": return "Sessão de prática";
    case "usage": return "Uso registrado";
    case "learning": return "Item de aprendizado";
    default: return kind;
  }
}

function UserDetailPage() {
  const { detail } = Route.useLoaderData();
  const p = detail.profile;
  const up = detail.userProfile;
  const st = detail.stats;

  return (
    <AdminShell title="Detalhes do usuário">
      <div className="mb-4">
        <Link to="/admin/users" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 size-4" /> Voltar aos usuários
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card/40 p-5">
          <h2 className="mb-3 text-sm uppercase tracking-wide text-muted-foreground">Dados principais</h2>
          <div className="space-y-1 text-sm">
            <div className="font-display text-xl font-bold">{p?.name || "—"}</div>
            <div className="text-muted-foreground">{p?.email}</div>
            <Row label="Cadastro" value={p?.created_at ? new Date(p.created_at).toLocaleString("pt-BR") : "—"} />
            <Row label="Último login" value={p?.last_login ? new Date(p.last_login).toLocaleString("pt-BR") : "—"} />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/40 p-5">
          <h2 className="mb-3 text-sm uppercase tracking-wide text-muted-foreground">Perfil de aprendizado</h2>
          <div className="space-y-1 text-sm">
            <Row label="Onboarding" value={up?.onboarding_completed ? "Concluído" : "Incompleto"} />
            <Row label="Nível" value={up?.english_level ?? "—"} />
            <Row label="Objetivo" value={up?.main_goal ?? "—"} />
            <Row label="Área profissional" value={up?.primary_professional_area ?? "—"} />
            <Row label="Dificuldade" value={up?.biggest_difficulty ?? "—"} />
            <Row label="Velocidade" value={up?.speaking_speed_preference ?? "—"} />
            <Row label="Correção" value={up?.correction_preference ?? "—"} />
            <Row label="Idioma explicações" value={up?.explanation_language ?? "—"} />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/40 p-5">
          <h2 className="mb-3 text-sm uppercase tracking-wide text-muted-foreground">Progresso</h2>
          <div className="space-y-1 text-sm">
            <Row label="XP" value={String(st?.xp ?? 0)} />
            <Row label="Streak atual" value={String(st?.streak_days ?? 0)} />
            <Row label="Maior streak" value={String(st?.longest_streak ?? 0)} />
          </div>
        </section>
      </div>

      <h2 className="mt-8 mb-3 font-display text-lg font-semibold">Engajamento</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <AdminMetricCard label="Conversas" value={detail.totals.conversations} icon={MessageCircle} />
        <AdminMetricCard label="Conversas 7d" value={detail.totals.conversations_7d} />
        <AdminMetricCard label="Conversas 30d" value={detail.totals.conversations_30d} />
        <AdminMetricCard label="Mensagens" value={detail.totals.messages} icon={MessageCircle} />
        <AdminMetricCard label="Prática" value={detail.totals.practice_sessions} icon={ClipboardCheck} />
        <AdminMetricCard label="Voz (min)" value={Number(detail.totals.voice_minutes).toFixed(1)} icon={Mic} />
        <AdminMetricCard label="XP" value={st?.xp ?? 0} icon={Zap} />
        <AdminMetricCard label="Streak" value={st?.streak_days ?? 0} icon={Flame} />
        <AdminMetricCard label="Maior streak" value={st?.longest_streak ?? 0} icon={Sparkles} />
      </div>

      <h2 className="mt-8 mb-3 font-display text-lg font-semibold">Atividade recente</h2>
      <div className="rounded-2xl border border-border bg-card/40 p-3">
        {detail.activity.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Sem atividade registrada.</div>
        ) : (
          <ul className="divide-y divide-border">
            {detail.activity.map((e: ActivityEvent, i: number) => (
              <li key={i} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-medium">{KindLabel(e.kind)}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.kind === "conversation" && (
                      <>Modo: {String(e.meta.mode ?? "—")} · {String(e.meta.title ?? "")}</>
                    )}
                    {e.kind === "practice" && (
                      <>{String(e.meta.activity ?? "")} · {String(e.meta.items_correct ?? 0)}/{String(e.meta.items_total ?? 0)} · +{String(e.meta.xp ?? 0)} XP</>
                    )}
                    {e.kind === "usage" && (
                      <>{String(e.meta.action ?? "")} · {String(e.meta.voice_min ?? 0)} min · {String(e.meta.msgs ?? 0)} msgs</>
                    )}
                    {e.kind === "learning" && (
                      <>{String(e.meta.kind ?? "")} {e.meta.mastered ? "· dominado" : ""}</>
                    )}
                  </div>
                </div>
                <div className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(e.ts).toLocaleString("pt-BR")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Por privacidade, o conteúdo das mensagens não é exibido aqui.
      </p>
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
