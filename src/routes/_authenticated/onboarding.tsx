import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { saveOnboarding, getMyProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  loader: async () => {
    const data = await getMyProfile();
    if (data.userProfile) throw redirect({ to: "/dashboard" });
    return { name: data.profile?.name ?? "" };
  },
  component: Onboarding,
});

type Form = {
  english_level: "beginner" | "basic" | "intermediate" | "advanced" | "";
  main_goal: string;
  biggest_difficulty: string;
  correction_preference: "always" | "sometimes" | "ask" | "";
  speaking_speed_preference: "slow" | "normal" | "fast" | "";
  explanation_language: "portuguese" | "english" | "mixed" | "";
  specific_training_situation: string;
};

const steps: {
  key: keyof Form;
  title: string;
  subtitle?: string;
  type: "choice" | "text";
  options?: { value: string; label: string; hint?: string }[];
  optional?: boolean;
  placeholder?: string;
}[] = [
  { key: "english_level", title: "Qual é seu nível de inglês?", type: "choice", options: [
    { value: "beginner", label: "Iniciante", hint: "Mal começo frases" },
    { value: "basic", label: "Básico", hint: "Frases simples" },
    { value: "intermediate", label: "Intermediário", hint: "Conversas do dia a dia" },
    { value: "advanced", label: "Avançado", hint: "Falo com fluência" },
  ]},
  { key: "main_goal", title: "Qual é seu principal objetivo?", type: "choice", options: [
    { value: "work", label: "Trabalho" },
    { value: "job_interview", label: "Entrevista de emprego" },
    { value: "travel", label: "Viagem" },
    { value: "conversation", label: "Conversação" },
    { value: "study", label: "Estudo" },
    { value: "presentation", label: "Apresentação" },
    { value: "meeting", label: "Reunião" },
    { value: "other", label: "Outro" },
  ]},
  { key: "biggest_difficulty", title: "Qual sua maior dificuldade hoje?", type: "choice", options: [
    { value: "speaking", label: "Falar" },
    { value: "listening", label: "Entender ouvindo" },
    { value: "building_sentences", label: "Montar frases" },
    { value: "vocabulary", label: "Vocabulário" },
    { value: "grammar", label: "Gramática" },
    { value: "shyness", label: "Vergonha / travamento" },
    { value: "pronunciation", label: "Pronúncia" },
  ]},
  { key: "correction_preference", title: "Como você quer que Fred corrija seus erros?", type: "choice", options: [
    { value: "always", label: "Sempre" },
    { value: "sometimes", label: "Às vezes" },
    { value: "ask", label: "Somente quando eu pedir" },
  ]},
  { key: "speaking_speed_preference", title: "Em qual ritmo Fred deve falar?", type: "choice", options: [
    { value: "slow", label: "Bem devagar" },
    { value: "normal", label: "Normal" },
    { value: "fast", label: "Mais natural" },
  ]},
  { key: "explanation_language", title: "Em que idioma você quer as explicações?", type: "choice", options: [
    { value: "portuguese", label: "Português" },
    { value: "english", label: "Inglês" },
    { value: "mixed", label: "Misturado" },
  ]},
  { key: "specific_training_situation", title: "Tem alguma situação específica que quer treinar?", subtitle: "Ex: entrevista, viagem, reunião, atendimento. (Opcional)", type: "text", optional: true, placeholder: "Conte em poucas palavras..." },
];

function Onboarding() {
  const { name } = Route.useLoaderData();
  const navigate = useNavigate();
  const save = useServerFn(saveOnboarding);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<Form>({
    english_level: "", main_goal: "", biggest_difficulty: "",
    correction_preference: "", speaking_speed_preference: "",
    explanation_language: "", specific_training_situation: "",
  });

  const current = steps[step];
  const value = form[current.key];
  const canNext = current.optional || value.length > 0;

  async function next() {
    if (step < steps.length - 1) { setStep(step + 1); return; }
    setSubmitting(true);
    try {
      await save({ data: {
        english_level: form.english_level as never,
        main_goal: form.main_goal,
        biggest_difficulty: form.biggest_difficulty,
        correction_preference: form.correction_preference as never,
        speaking_speed_preference: form.speaking_speed_preference as never,
        explanation_language: form.explanation_language as never,
        specific_training_situation: form.specific_training_situation || null,
      }});
      toast.success("Perfil salvo! Vamos conversar com Fred.");
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Olá{name ? `, ${name}` : ""} 👋</span>
        <span>{step + 1} / {steps.length}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>

      <div className="mt-10 flex-1">
        <h1 className="font-display text-2xl font-bold md:text-3xl">{current.title}</h1>
        {current.subtitle && <p className="mt-2 text-muted-foreground">{current.subtitle}</p>}

        <div className="mt-6">
          {current.type === "choice" ? (
            <div className="grid gap-2 md:grid-cols-2">
              {current.options!.map((o) => {
                const selected = value === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() => setForm({ ...form, [current.key]: o.value } as Form)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border bg-card/60 p-4 text-left transition",
                      selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50",
                    )}
                  >
                    <div>
                      <p className="font-medium">{o.label}</p>
                      {o.hint && <p className="text-xs text-muted-foreground">{o.hint}</p>}
                    </div>
                    {selected && <Check className="size-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              <Label className="sr-only">{current.title}</Label>
              <Input
                placeholder={current.placeholder}
                value={value}
                onChange={(e) => setForm({ ...form, [current.key]: e.target.value } as Form)}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          <ArrowLeft className="mr-1 size-4" /> Voltar
        </Button>
        <Button onClick={next} disabled={!canNext || submitting}>
          {step === steps.length - 1 ? (submitting ? "Salvando..." : "Concluir") : "Avançar"}
          <ArrowRight className="ml-1 size-4" />
        </Button>
      </div>
    </div>
  );
}
