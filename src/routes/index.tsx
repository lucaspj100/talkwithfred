import { createFileRoute, Link } from "@tanstack/react-router";
import fredAvatar from "@/assets/fred-avatar.jpg";
import { Button } from "@/components/ui/button";
import { MessageCircle, Mic, Sparkle, Globe2, ShieldCheck, Clock, ArrowRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Talk With Fred — Aprenda inglês conversando" },
      { name: "description", content: "Pratique inglês por texto ou voz com Fred, uma IA que conversa com você, corrige seus erros e ajuda você a falar com mais confiança." },
      { property: "og:title", content: "Talk With Fred" },
      { property: "og:description", content: "Pratique inglês conversando com Fred, sua IA parceira de conversação." },
      { property: "og:image", content: fredAvatar },
      { name: "twitter:image", content: fredAvatar },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">F</span>
          Talk With Fred
        </div>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Entrar</Link>
          <Link to="/auth"><Button>Começar agora</Button></Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-24 pt-12 md:grid-cols-2 md:items-center md:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <Sparkle className="size-3 text-primary" /> MVP — versão de testes
          </span>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight md:text-6xl">
            Aprenda inglês <span className="text-primary">conversando</span> com Fred
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Pratique inglês por texto ou voz com uma IA que conversa com você,
            corrige seus erros e te ajuda a falar com mais confiança.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth"><Button size="lg" className="text-base">Começar agora <ArrowRight className="ml-1 size-4" /></Button></Link>
            <a href="#como-funciona"><Button size="lg" variant="ghost" className="text-base">Como funciona</Button></a>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> Sem cartão</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> Texto e voz</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> Personalizado</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="fred-ring mx-auto h-72 w-72" data-state="responding">
            <img src={fredAvatar} alt="Fred, seu parceiro de conversação em inglês" width={1024} height={1024} className="h-72 w-72 rounded-full object-cover" />
          </div>
          <div className="mt-6 rounded-2xl border border-border bg-card/70 p-4 shadow-2xl backdrop-blur">
            <p className="text-sm text-muted-foreground">Fred</p>
            <p className="mt-1 text-base">Hey! What did you do this weekend? Tell me in English — don't worry about mistakes.</p>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-bold md:text-4xl">Como funciona</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Quatro passos simples para começar a falar inglês hoje.
        </p>
        <ol className="mt-12 grid gap-4 md:grid-cols-4">
          {[
            { t: "Crie sua conta", d: "Cadastro rápido com e-mail e senha." },
            { t: "Conte seu nível", d: "Responda perguntas rápidas para personalizar." },
            { t: "Converse com Fred", d: "Em texto ou voz, no seu ritmo." },
            { t: "Receba correções", d: "Frases melhores, explicações e novas perguntas." },
          ].map((s, i) => (
            <li key={s.t} className="rounded-2xl border border-border bg-card/60 p-5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary font-bold">{i + 1}</div>
              <h3 className="mt-3 font-display text-lg font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-bold md:text-4xl">Por que usar o Fred</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { icon: ShieldCheck, t: "Sem vergonha", d: "Pratique inglês num espaço seguro. Errar aqui é parte do método." },
            { icon: Globe2, t: "No seu nível", d: "Fred se adapta ao seu inglês, do iniciante ao avançado." },
            { icon: MessageCircle, t: "Correções simples", d: "Mostra a frase correta e explica o porquê em poucas palavras." },
            { icon: Mic, t: "Treine fala e escuta", d: "Fale pelo microfone e ouça Fred responder em voz." },
            { icon: Sparkle, t: "Texto ou voz", d: "Use o que combinar com o seu momento." },
            { icon: Clock, t: "Disponível 24/7", d: "Parceiro de inglês a qualquer hora, sem agenda." },
          ].map((b) => (
            <div key={b.t} className="rounded-2xl border border-border bg-card/60 p-5">
              <b.icon className="size-6 text-primary" />
              <h3 className="mt-3 font-display text-lg font-semibold">{b.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
        <div className="rounded-3xl border border-border bg-gradient-to-br from-primary/15 to-card p-10">
          <h2 className="font-display text-3xl font-bold md:text-4xl">Pronto para falar inglês com Fred?</h2>
          <p className="mt-3 text-muted-foreground">É grátis nesta versão de testes. Comece em menos de 1 minuto.</p>
          <Link to="/auth" className="mt-6 inline-block"><Button size="lg">Começar agora <ArrowRight className="ml-1 size-4" /></Button></Link>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Talk With Fred
      </footer>
    </div>
  );
}
