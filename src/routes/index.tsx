import { createFileRoute, Link } from "@tanstack/react-router";
import fredAvatar from "@/assets/fred-avatar.jpg";
import { Button } from "@/components/ui/button";
import { LucasBrand } from "@/components/LucasBrand";
import { ArrowRight, Sparkle, Target, MessageCircle, Globe2, ClipboardList, MapIcon } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Simulador de Inglês para Carreira — Fred" },
      {
        name: "description",
        content:
          "Você tem capacidade para oportunidades maiores, mas o inglês ainda te faz recuar? Faça uma simulação gratuita com IA e descubra onde seu inglês trava sua carreira.",
      },
      { property: "og:title", content: "Simulador de Inglês para Carreira — Fred" },
      {
        property: "og:description",
        content: "Simulação gratuita com IA para profissionais. Veja onde seu inglês trava e quais oportunidades podem estar fora do seu radar.",
      },
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
        <LucasBrand linkTo="/" />

        <div className="flex items-center">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Entrar</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-24 pt-12 md:grid-cols-2 md:items-center md:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <Sparkle className="size-3 text-primary" /> Simulador de Inglês para Carreira
          </span>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight md:text-5xl">
            Você tem capacidade para oportunidades maiores, mas o inglês ainda te faz <span className="text-primary">recuar?</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Faça uma simulação gratuita com IA, veja onde seu inglês trava e descubra quais oportunidades podem estar ficando fora do seu radar.
          </p>
          <div className="mt-8 flex justify-center md:justify-start">
            <Link to="/auth" className="w-full sm:w-auto">
              <Button size="lg" className="w-full text-base sm:w-auto">
                Praticar com a IA agora <ArrowRight className="ml-1 size-4" />
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Simulação com IA · Feedback personalizado · Sem cartão de crédito
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="fred-ring mx-auto h-72 w-72" data-state="responding">
            <img src={fredAvatar} alt="Fred, IA que simula situações profissionais em inglês" width={1024} height={1024} className="h-72 w-72 rounded-full object-cover" />
          </div>
          <div className="mt-6 rounded-2xl border border-border bg-card/70 p-4 shadow-2xl backdrop-blur">
            <p className="text-sm text-muted-foreground">Fred (recrutador internacional)</p>
            <p className="mt-1 text-base">
              Hi! Thanks for joining today. Could you tell me a little about your background and the kind of role you're looking for?
            </p>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-bold md:text-4xl">Como funciona</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Em minutos, você descobre onde o inglês trava sua carreira — e o que fazer a partir disso.
        </p>
        <ol className="mt-12 grid gap-4 md:grid-cols-4">
          {[
            {
              icon: ClipboardList,
              t: "Responda seu momento profissional",
              d: "Área, objetivo, nível atual de inglês e onde você mais sente que trava.",
            },
            {
              icon: MessageCircle,
              t: "Faça uma simulação com Fred",
              d: "Fred conduz uma situação real de carreira: entrevista, reunião, apresentação ou conversa com recrutador.",
            },
            {
              icon: MapIcon,
              t: "Receba seu Mapa de Oportunidades",
              d: "Feedback simples com sua principal trava, oportunidades no radar e próximo passo sugerido.",
            },
            {
              icon: Globe2,
              t: "Continue pelo WhatsApp",
              d: "Continue sua análise e verifique se você se encaixa em uma bolsa parcial de inglês executivo.",
            },
          ].map((s, i) => (
            <li key={s.t} className="rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary font-bold">{i + 1}</div>
                <s.icon className="size-5 text-primary" />
              </div>
              <h3 className="mt-3 font-display text-lg font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Link to="/simulacao">
            <Button size="lg">Ver meu mapa de oportunidades na carreira <ArrowRight className="ml-1 size-4" /></Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-bold md:text-4xl">Para quem é</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { icon: Target, t: "Profissionais que travam em situações reais", d: "Entrevistas, reuniões com times globais, apresentações, conversas com recrutadores." },
            { icon: Globe2, t: "Quem quer acessar vagas internacionais", d: "Trabalho remoto, projetos globais, oportunidades em dólar ou euro — dependendo da área e experiência." },
            { icon: Sparkle, t: "Quem já recuou por causa do inglês", d: "Você não é incapaz. Você só ainda não praticou o inglês certo para o momento da sua carreira." },
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
          <h2 className="font-display text-3xl font-bold md:text-4xl">
            Descubra em minutos onde seu inglês está travando sua carreira
          </h2>
          <p className="mt-3 text-muted-foreground">
            A simulação é gratuita. Você recebe um Mapa de Oportunidades no final.
          </p>
          <Link to="/simulacao" className="mt-6 inline-block">
            <Button size="lg">Ver meu mapa de oportunidades na carreira <ArrowRight className="ml-1 size-4" /></Button>
          </Link>
          <p className="mt-4 text-xs text-muted-foreground">
            As estimativas exibidas são possibilidades de mercado, não garantias de salário, promoção ou contratação.
          </p>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Talk With Fred · Simulador de Inglês para Carreira
      </footer>
    </div>
  );
}
