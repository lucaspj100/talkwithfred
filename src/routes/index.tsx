import { createFileRoute, Link } from "@tanstack/react-router";
import fredAvatar from "@/assets/fred-avatar.jpg";
import { Button } from "@/components/ui/button";
import { LucasBrand } from "@/components/LucasBrand";
import { Mic, Keyboard } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Talk With Fred — Pratique inglês em situações reais" },
      {
        name: "description",
        content:
          "Converse em inglês com Fred, receba correções e ganhe confiança para situações reais.",
      },
      { property: "og:title", content: "Talk With Fred — Pratique inglês em situações reais" },
      {
        property: "og:description",
        content: "Converse em inglês com Fred, receba correções e ganhe confiança para situações reais.",
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
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <LucasBrand linkTo="/" />
        <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
          Entrar
        </Link>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col items-center px-6 pb-16 pt-6 text-center md:pt-12">
        <div className="fred-ring mx-auto h-40 w-40 md:h-52 md:w-52" data-state="responding">
          <img
            src={fredAvatar}
            alt="Fred, seu parceiro de conversação em inglês"
            width={512}
            height={512}
            className="h-full w-full rounded-full object-cover"
          />
        </div>

        <h1 className="mt-8 font-display text-4xl font-extrabold leading-tight md:text-5xl">
          Pratique inglês falando com <span className="text-primary">Fred</span>
        </h1>
        <p className="mt-4 max-w-lg text-lg text-muted-foreground">
          Converse em inglês, receba correções e ganhe confiança para situações reais.
        </p>

        <div className="mt-8 flex w-full max-w-sm flex-col items-stretch gap-3">
          <Link to="/auth" className="w-full">
            <Button
              size="lg"
              className="h-12 w-full rounded-full bg-cta text-base font-semibold text-cta-foreground shadow-lg shadow-cta/20 hover:bg-cta/90"
            >
              <Mic className="mr-2 size-5" /> Começar conversa
            </Button>
          </Link>
          <Link to="/auth" className="w-full">
            <Button
              size="lg"
              variant="ghost"
              className="h-12 w-full rounded-full text-base text-muted-foreground hover:text-foreground"
            >
              <Keyboard className="mr-2 size-5" /> Prefiro digitar
            </Button>
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Conversação com IA · Feedback personalizado · Sem cartão de crédito
        </p>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Talk With Fred · Seu parceiro de conversação em inglês
      </footer>
    </div>
  );
}
