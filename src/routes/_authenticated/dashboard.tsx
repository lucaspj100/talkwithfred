import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { listConversations, createConversation } from "@/lib/conversations.functions";
import { MODES, type Mode } from "@/lib/fred-prompt";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LogOut, MessageCircle, ShieldAlert } from "lucide-react";
import fredAvatar from "@/assets/fred-avatar.jpg";

export const Route = createFileRoute("/_authenticated/dashboard")({
  loader: async () => {
    const me = await getMyProfile();
    if (!me.userProfile) throw redirect({ to: "/onboarding" });
    const convs = await listConversations();
    return { me, convs };
  },
  component: Dashboard,
});

const LABEL: Record<string, string> = {
  beginner: "Iniciante", basic: "Básico", intermediate: "Intermediário", advanced: "Avançado",
  work: "Trabalho", job_interview: "Entrevista", travel: "Viagem", conversation: "Conversação",
  study: "Estudo", presentation: "Apresentação", meeting: "Reunião", other: "Outro",
  speaking: "Falar", listening: "Escutar", building_sentences: "Montar frases",
  vocabulary: "Vocabulário", grammar: "Gramática", shyness: "Vergonha", pronunciation: "Pronúncia",
};

function Dashboard() {
  const { me, convs } = Route.useLoaderData();
  const navigate = useNavigate();
  const create = useServerFn(createConversation);

  async function startChat(mode: Mode) {
    try {
      const { id } = await create({ data: { mode } });
      navigate({ to: "/chat/$conversationId", params: { conversationId: id } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-10 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">F</span>
          Talk With Fred
        </Link>
        <div className="flex items-center gap-2">
          {me.isAdmin && (
            <Link to="/admin"><Button variant="ghost" size="sm"><ShieldAlert className="mr-1 size-4" />Admin</Button></Link>
          )}
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="mr-1 size-4" />Sair</Button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr,auto] md:items-center">
        <div>
          <h1 className="font-display text-3xl font-bold md:text-4xl">
            Olá, {me.profile?.name || "amigo"}. Pronto para praticar inglês com Fred?
          </h1>
          <p className="mt-2 text-muted-foreground">
            Escolha um modo abaixo ou continue uma conversa anterior.
          </p>
        </div>
        <div className="fred-ring h-24 w-24 justify-self-end" data-state="neutral">
          <img src={fredAvatar} alt="Fred" width={1024} height={1024} loading="lazy" className="h-24 w-24 rounded-full object-cover" />
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card/60 p-5">
          <p className="text-xs uppercase text-muted-foreground">Seu nível</p>
          <p className="mt-1 font-display text-xl font-semibold">{LABEL[me.userProfile!.english_level] ?? me.userProfile!.english_level}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/60 p-5">
          <p className="text-xs uppercase text-muted-foreground">Objetivo principal</p>
          <p className="mt-1 font-display text-xl font-semibold">{LABEL[me.userProfile!.main_goal] ?? me.userProfile!.main_goal}</p>
        </div>
      </div>

      <h2 className="mt-12 font-display text-xl font-bold">Escolha um modo de conversa</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => startChat(m.id)}
            className="group rounded-2xl border border-border bg-card/60 p-5 text-left transition hover:border-primary/60 hover:bg-card"
          >
            <p className="font-display text-base font-semibold">{m.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
            <span className="mt-3 inline-flex items-center text-xs text-primary opacity-0 transition group-hover:opacity-100">
              Conversar <MessageCircle className="ml-1 size-3" />
            </span>
          </button>
        ))}
      </div>

      <h2 className="mt-12 font-display text-xl font-bold">Suas últimas conversas</h2>
      <div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40">
        {convs.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">Nenhuma conversa ainda. Escolha um modo acima para começar.</p>
        )}
        {convs.slice(0, 8).map((c) => (
          <Link
            key={c.id}
            to="/chat/$conversationId"
            params={{ conversationId: c.id }}
            className="flex items-center justify-between px-5 py-3 hover:bg-accent/30"
          >
            <div>
              <p className="font-medium">{c.title}</p>
              <p className="text-xs text-muted-foreground">
                {MODES.find((m) => m.id === c.mode)?.label ?? c.mode} · {new Date(c.updated_at).toLocaleString("pt-BR")}
              </p>
            </div>
            <MessageCircle className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
