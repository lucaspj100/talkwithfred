import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { markLeadConverted } from "@/lib/leads.functions";
import {
  labelArea,
  labelBlock,
  labelGoalSim,
  labelLevelSim,
} from "@/lib/simulation-options";
import { ArrowLeft, MessageCircle, Sparkle, Target, Globe2, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/simulacao/resultado")({
  head: () => ({
    meta: [
      { title: "Seu Mapa de Oportunidades — Lucas" },
      { name: "description", content: "Veja onde seu inglês trava e quais oportunidades podem estar fora do seu radar hoje." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResultadoPage,
});

type Saved = {
  leadId: string;
  name: string;
  diag: {
    areas?: string[];
    other_area?: string | null;
    area?: string | null;
    goal: string | null;
    level: string | null;
    main_block: string | null;
    already_lost_opportunity: string | null;
  };
};

function ResultadoPage() {
  const [saved, setSaved] = useState<Saved | null>(null);
  const mark = useServerFn(markLeadConverted);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("fred_lead");
      if (raw) setSaved(JSON.parse(raw) as Saved);
    } catch { /* noop */ }
  }, []);

  if (!saved) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-muted-foreground">Não encontramos sua simulação. Vamos começar de novo?</p>
        <Link to="/simulacao" className="mt-4 inline-block"><Button>Fazer simulação</Button></Link>
      </div>
    );
  }

  const { name, diag } = saved;
  const areaList = [
    ...(diag.areas ?? []).map((v) => (v === "other" ? (diag.other_area || "Outra") : labelArea(v))).filter(Boolean),
  ];
  if (areaList.length === 0 && diag.area) areaList.push(labelArea(diag.area) || diag.area);
  const area = areaList.join(", ");
  const goal = labelGoalSim(diag.goal);
  const block = labelBlock(diag.main_block) || "usar o inglês em contextos profissionais reais";
  const level = labelLevelSim(diag.level);

  const wa = import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined;
  const waMessage = encodeURIComponent(
    `Oi! Sou ${name}. Acabei de fazer a simulação com o Lucas.\n\nMinha área: ${area || "—"}\nObjetivo: ${goal || "—"}\nOnde mais travo: ${block}\nNível: ${level || "—"}\n\nQuero continuar minha análise e entender se me encaixo na bolsa parcial.`,
  );
  const waHref = wa ? `https://wa.me/${wa.replace(/\D/g, "")}?text=${waMessage}` : null;

  const leadId = saved.leadId;
  async function handleConvert() {
    try { await mark({ data: { leadId } }); } catch { /* noop */ }
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">F</span>
          Speak With Lucas
        </Link>
        <Link to="/simulacao" className="text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 inline size-3" /> Refazer simulação
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
          <Sparkle className="size-3 text-primary" /> Análise personalizada
        </span>
        <h1 className="mt-4 font-display text-3xl font-extrabold md:text-4xl">
          Seu Mapa de Oportunidades, {name.split(" ")[0]}
        </h1>
        <p className="mt-3 text-muted-foreground">
          Você parece ter clareza da importância do inglês, mas ainda sente insegurança para usar o idioma em situações
          profissionais reais. Abaixo, um resumo do que Lucas percebeu e por onde seu inglês pode estar te limitando.
        </p>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <Card icon={<Target className="size-5 text-primary" />} title="Principal trava percebida">
            <p>
              Você indicou que o inglês mais te limita em <strong>{block}</strong>.
              {level && ` Seu nível declarado é ${level.toLowerCase()},`} e isso costuma travar profissionais na hora de
              se posicionar em situações de alta pressão — como entrevistas, reuniões com times globais e conversas com
              recrutadores internacionais.
            </p>
          </Card>
          <Card icon={<Sparkle className="size-5 text-primary" />} title="Resumo do perfil">
            <p>
              Área: <strong>{area || "não informada"}</strong>. Objetivo principal: <strong>{goal || "carreira"}</strong>.
              Você está em um momento onde o inglês pode se tornar o divisor entre continuar onde está e acessar
              oportunidades maiores.
            </p>
          </Card>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <Card icon={<TrendingUp className="size-5 text-primary" />} title="Oportunidades nacionais">
            <p>
              Aqui no Brasil, inglês executivo costuma ampliar acesso a <strong>multinacionais</strong>,
              <strong> promoções</strong>, cargos com <strong>contato internacional</strong>, reuniões com times globais e
              processos seletivos mais competitivos — inclusive dentro da sua área ({area || "sua área"}).
            </p>
          </Card>
          <Card icon={<Globe2 className="size-5 text-primary" />} title="Oportunidades internacionais">
            <p>
              Dependendo da sua senioridade e experiência, o inglês pode abrir portas para <strong>entrevistas internacionais</strong>,
              <strong> trabalho remoto</strong>, projetos globais e oportunidades <strong>em dólar ou euro</strong>.
              Muitos profissionais têm currículo compatível, mas recuam por medo de falar.
            </p>
          </Card>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-6">
          <h2 className="font-display text-xl font-bold">Estimativa de impacto</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>• Oportunidades nacionais com inglês costumam ampliar acesso a cargos mais competitivos e empresas com atuação internacional.</li>
            <li>• Oportunidades internacionais podem envolver remuneração em moeda forte, dependendo da área, experiência, senioridade e país.</li>
            <li>• O inglês não garante aumento de salário, mas pode aumentar o número e o tipo de oportunidades disponíveis.</li>
          </ul>
        </section>

        <section className="mt-8 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 to-card p-8">
          <h2 className="font-display text-2xl font-bold md:text-3xl">Próximo passo sugerido</h2>
          <p className="mt-2 text-muted-foreground">
            Seu próximo passo não é apenas estudar mais inglês. É praticar o <strong>inglês certo</strong> para as
            situações que podem mudar sua carreira.
          </p>
          <div className="mt-6">
            {waHref ? (
              <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={handleConvert}>
                <Button size="lg" className="text-base">
                  <MessageCircle className="mr-2 size-4" /> Quero continuar minha análise pelo WhatsApp
                </Button>
              </a>
            ) : (
              <Button size="lg" disabled title="Configure VITE_WHATSAPP_NUMBER">
                <MessageCircle className="mr-2 size-4" /> WhatsApp em breve
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Continue pelo WhatsApp para entender seu resultado, receber uma orientação personalizada e verificar se você
            se encaixa em uma <strong>bolsa parcial de inglês executivo</strong>.
          </p>
        </section>

        <p className="mt-8 text-xs text-muted-foreground">
          As estimativas são possibilidades de mercado, não garantias de salário, promoção ou contratação. Os resultados
          variam conforme área, experiência, dedicação, empresa, país e evolução individual.
        </p>
      </main>
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-display text-lg font-semibold">{title}</h3>
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
