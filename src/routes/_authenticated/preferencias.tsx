import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Volume2, Vibrate } from "lucide-react";
import { useExerciseFeedback } from "@/hooks/use-exercise-feedback";
import { playExerciseFeedback } from "@/lib/exercise-feedback";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/preferencias")({
  component: PreferencesPage,
  head: () => ({
    meta: [
      { title: "Preferências · Talk With Fred" },
      { name: "description", content: "Ajuste sons e vibração dos exercícios do Talk With Fred." },
    ],
  }),
});

function Row({
  icon,
  title,
  description,
  checked,
  onChange,
  onTest,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  onTest?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex flex-1 items-start gap-3">
        <div className="mt-0.5 grid size-9 place-items-center rounded-full bg-primary/10 text-primary">{icon}</div>
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          {onTest && (
            <button type="button" onClick={onTest} className="mt-2 text-xs text-primary hover:underline">
              Testar
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block size-5 transform rounded-full bg-background shadow transition ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function PreferencesPage() {
  const { soundEnabled, vibrationEnabled, toggleSound, toggleVibration } = useExerciseFeedback();

  return (
    <div className="mx-auto max-w-xl pb-24">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard"><ArrowLeft className="mr-1 size-4" />Voltar</Link>
        </Button>
      </div>
      <h1 className="font-display text-2xl font-bold">Preferências</h1>
      <p className="mt-1 text-sm text-muted-foreground">Ajuste como você quer receber feedback nos exercícios.</p>

      <div className="mt-6 space-y-3">
        <Row
          icon={<Volume2 className="size-4" />}
          title="Sons dos exercícios"
          description="Toca um som curto ao acertar, errar ou concluir um treino."
          checked={soundEnabled}
          onChange={toggleSound}
          onTest={() => playExerciseFeedback("correct")}
        />
        <Row
          icon={<Vibrate className="size-4" />}
          title="Vibração dos exercícios"
          description="Vibração leve no celular. Ignorada em computadores."
          checked={vibrationEnabled}
          onChange={toggleVibration}
          onTest={() => playExerciseFeedback("incorrect")}
        />
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Suas preferências ficam salvas neste dispositivo.
      </p>
    </div>
  );
}
