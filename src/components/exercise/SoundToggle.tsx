import { Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useExerciseFeedback } from "@/hooks/use-exercise-feedback";

export function SoundToggle({ className = "" }: { className?: string }) {
  const { soundEnabled, toggleSound } = useExerciseFeedback();
  return (
    <button
      type="button"
      onClick={() => {
        const next = toggleSound();
        toast(next ? "Sons ativados." : "Sons desativados.", { duration: 1500 });
      }}
      aria-label={soundEnabled ? "Desativar sons dos exercícios" : "Ativar sons dos exercícios"}
      aria-pressed={soundEnabled}
      title={soundEnabled ? "Sons ativados" : "Sons desativados"}
      className={`inline-flex size-9 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground transition hover:text-foreground ${className}`}
    >
      {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
    </button>
  );
}
