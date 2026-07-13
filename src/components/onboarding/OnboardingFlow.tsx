import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { saveOnboarding } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Check, X, Plus } from "lucide-react";
import {
  ENGLISH_GOALS,
  PROFESSIONAL_AREAS,
  GENERAL_SITUATIONS,
  AREA_SITUATIONS,
  ENGLISH_LEVELS,
  CORRECTION_PREFS,
  PRACTICE_GOALS,
  labelGoal,
  labelArea,
  labelSituation,
  labelLevel,
  labelCorrection,
  labelPracticeGoal,
} from "@/lib/onboarding-options";

export type OnboardingInitial = {
  english_goals?: string[];
  primary_english_goal?: string | null;
  professional_areas?: string[];
  primary_professional_area?: string | null;
  custom_professional_area?: string | null;
  preferred_situations?: string[];
  technical_terms?: string[];
  english_level?: string | null;
  correction_preference?: string | null;
  practice_goal?: string | null;
};

type State = {
  english_goals: string[];
  primary_english_goal: string;
  professional_areas: string[];
  primary_professional_area: string | null;
  custom_professional_area: string;
  preferred_situations: string[];
  technical_terms: string[];
  english_level: string;
  correction_preference: string;
  practice_goal: string;
};

const LEGACY_CORRECTION_MAP: Record<string, string> = {
  always: "heavy",
  sometimes: "balanced",
  ask: "light",
};

function normalizeInitial(initial?: OnboardingInitial): State {
  const correction = initial?.correction_preference ?? "";
  return {
    english_goals: initial?.english_goals ?? [],
    primary_english_goal: initial?.primary_english_goal ?? "",
    professional_areas: initial?.professional_areas ?? [],
    primary_professional_area: initial?.primary_professional_area ?? null,
    custom_professional_area: initial?.custom_professional_area ?? "",
    preferred_situations: initial?.preferred_situations ?? [],
    technical_terms: initial?.technical_terms ?? [],
    english_level: initial?.english_level ?? "",
    correction_preference: LEGACY_CORRECTION_MAP[correction] ?? correction ?? "",
    practice_goal: initial?.practice_goal ?? "",
  };
}

export function OnboardingFlow({
  initial,
  editMode,
  userName,
}: {
  initial?: OnboardingInitial;
  editMode?: boolean;
  userName?: string | null;
}) {
  const navigate = useNavigate();
  const save = useServerFn(saveOnboarding);
  const [s, setS] = useState<State>(() => normalizeInitial(initial));
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const set = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));

  const toggle = (key: "english_goals" | "professional_areas" | "preferred_situations", v: string) => {
    setS((prev) => {
      const has = prev[key].includes(v);
      const next = has ? prev[key].filter((x) => x !== v) : [...prev[key], v];
      const patch: Partial<State> = { [key]: next } as Partial<State>;
      // keep primary in sync if removed
      if (key === "english_goals" && has && prev.primary_english_goal === v) patch.primary_english_goal = "";
      if (key === "professional_areas" && has && prev.primary_professional_area === v) patch.primary_professional_area = null;
      return { ...prev, ...patch };
    });
  };

  // Build dynamic step list
  const hasMultipleGoals = s.english_goals.length > 1;
  const hasAreas = s.professional_areas.length > 0 && !s.professional_areas.includes("none");
  const hasMultipleAreas = hasAreas && s.professional_areas.filter((a) => a !== "none").length > 1;

  const stepIds = useMemo(() => {
    const ids: string[] = ["goals"];
    if (hasMultipleGoals) ids.push("primary_goal");
    ids.push("areas");
    if (s.professional_areas.includes("other")) ids.push("custom_area");
    if (hasMultipleAreas) ids.push("primary_area");
    ids.push("situations", "terms", "level", "correction", "practice_goal", "summary");
    return ids;
  }, [hasMultipleGoals, hasMultipleAreas, s.professional_areas]);

  const current = stepIds[step];
  const total = stepIds.length;

  const canNext = (() => {
    switch (current) {
      case "goals": return s.english_goals.length > 0;
      case "primary_goal": return !!s.primary_english_goal;
      case "areas": return s.professional_areas.length > 0;
      case "custom_area": return s.custom_professional_area.trim().length > 0;
      case "primary_area": return !!s.primary_professional_area;
      case "situations": return true; // optional
      case "terms": return true;       // optional
      case "level": return !!s.english_level;
      case "correction": return !!s.correction_preference;
      case "practice_goal": return !!s.practice_goal;
      default: return true;
    }
  })();

  // Auto-set primary when only one selected
  if (!hasMultipleGoals && s.english_goals.length === 1 && s.primary_english_goal !== s.english_goals[0]) {
    setTimeout(() => set({ primary_english_goal: s.english_goals[0] }), 0);
  }
  if (!hasMultipleAreas && hasAreas && s.primary_professional_area !== s.professional_areas.find((a) => a !== "none")) {
    setTimeout(() => set({ primary_professional_area: s.professional_areas.find((a) => a !== "none") ?? null }), 0);
  }
  if (!hasAreas && s.primary_professional_area !== null) {
    setTimeout(() => set({ primary_professional_area: null }), 0);
  }

  // Build situations options based on primary area
  const situationOptions = useMemo(() => {
    const areaSpecific = s.primary_professional_area && AREA_SITUATIONS[s.primary_professional_area];
    return areaSpecific ? [...areaSpecific, ...GENERAL_SITUATIONS] : GENERAL_SITUATIONS;
  }, [s.primary_professional_area]);

  async function submit() {
    setSubmitting(true);
    try {
      await save({
        data: {
          english_goals: s.english_goals,
          primary_english_goal: s.primary_english_goal || s.english_goals[0],
          professional_areas: s.professional_areas,
          primary_professional_area: hasAreas ? s.primary_professional_area : null,
          custom_professional_area: s.professional_areas.includes("other") ? s.custom_professional_area.trim() : null,
          preferred_situations: s.preferred_situations,
          technical_terms: s.technical_terms,
          english_level: s.english_level as never,
          correction_preference: s.correction_preference as never,
          practice_goal: s.practice_goal as never,
        },
      });
      toast.success(
        editMode
          ? "Suas intenções foram atualizadas. A partir de agora, Lucas vai adaptar suas conversas e treinos para esse novo foco."
          : "Tudo certo! Vamos conversar com Lucas.",
      );
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (step < total - 1) setStep(step + 1);
    else submit();
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-4 py-10">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{editMode ? "Atualizando seu foco" : `Olá${userName ? `, ${userName}` : ""} 👋`}</span>
        <span>{step + 1} / {total}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>

      <div className="mt-8 flex-1">
        {current === "goals" && (
          <Step
            title="Por que você quer aprender inglês?"
            subtitle="Pode escolher quantos quiser. Depois você diz qual é o foco principal."
          >
            <MultiGrid
              options={ENGLISH_GOALS}
              selected={s.english_goals}
              onToggle={(v) => toggle("english_goals", v)}
            />
          </Step>
        )}

        {current === "primary_goal" && (
          <Step title="Qual desses é seu foco principal agora?" subtitle="Vamos usar isso para priorizar conversas e treinos.">
            <SingleGrid
              options={ENGLISH_GOALS.filter((o) => s.english_goals.includes(o.value))}
              value={s.primary_english_goal}
              onChange={(v) => set({ primary_english_goal: v })}
            />
          </Step>
        )}

        {current === "areas" && (
          <Step
            title="Você quer direcionar seu inglês para alguma área específica?"
            subtitle="Múltipla escolha. Se não quiser direcionar, marque a última opção."
          >
            <MultiGrid
              options={PROFESSIONAL_AREAS}
              selected={s.professional_areas}
              onToggle={(v) => {
                // "none" is exclusive
                if (v === "none") {
                  set({ professional_areas: s.professional_areas.includes("none") ? [] : ["none"], primary_professional_area: null });
                } else {
                  setS((prev) => {
                    const without = prev.professional_areas.filter((x) => x !== "none");
                    const has = without.includes(v);
                    const next = has ? without.filter((x) => x !== v) : [...without, v];
                    const patch: Partial<State> = { professional_areas: next };
                    if (has && prev.primary_professional_area === v) patch.primary_professional_area = null;
                    return { ...prev, ...patch };
                  });
                }
              }}
            />
          </Step>
        )}

        {current === "custom_area" && (
          <Step title="Qual sua área?" subtitle="Escreva em poucas palavras. Ex.: Mercado imobiliário, Logística, Gastronomia.">
            <Input
              autoFocus
              value={s.custom_professional_area}
              onChange={(e) => set({ custom_professional_area: e.target.value })}
              placeholder="Sua área..."
            />
          </Step>
        )}

        {current === "primary_area" && (
          <Step title="Qual área você quer priorizar agora?">
            <SingleGrid
              options={PROFESSIONAL_AREAS.filter((o) => s.professional_areas.includes(o.value) && o.value !== "none").map((o) =>
                o.value === "other" && s.custom_professional_area
                  ? { ...o, label: s.custom_professional_area }
                  : o,
              )}
              value={s.primary_professional_area ?? ""}
              onChange={(v) => set({ primary_professional_area: v })}
            />
          </Step>
        )}

        {current === "situations" && (
          <Step
            title="Quais situações você quer praticar?"
            subtitle="Múltipla escolha. Pode pular se quiser."
          >
            <MultiGrid
              options={situationOptions}
              selected={s.preferred_situations}
              onToggle={(v) => toggle("preferred_situations", v)}
            />
          </Step>
        )}

        {current === "terms" && (
          <Step
            title="Tem palavras ou termos que você quer aprender a usar em inglês?"
            subtitle="Opcional. Adicione um por vez. Ex.: lead, pipeline, deploy, bug."
          >
            <TermsInput
              terms={s.technical_terms}
              onChange={(terms) => set({ technical_terms: terms })}
            />
          </Step>
        )}

        {current === "level" && (
          <Step title="Qual é seu nível atual de inglês?">
            <SingleGrid
              options={ENGLISH_LEVELS}
              value={s.english_level}
              onChange={(v) => set({ english_level: v })}
            />
          </Step>
        )}

        {current === "correction" && (
          <Step title="Como você quer que Lucas corrija você?">
            <SingleGrid
              options={CORRECTION_PREFS}
              value={s.correction_preference}
              onChange={(v) => set({ correction_preference: v })}
            />
          </Step>
        )}

        {current === "practice_goal" && (
          <Step title="Qual meta você quer seguir?">
            <SingleGrid
              options={PRACTICE_GOALS}
              value={s.practice_goal}
              onChange={(v) => set({ practice_goal: v })}
            />
          </Step>
        )}

        {current === "summary" && (
          <Step title="Seu plano com Lucas" subtitle="Revise antes de começar. Você pode mudar depois.">
            <div className="space-y-3 rounded-2xl border border-border bg-card/60 p-5 text-sm">
              <SummaryRow label="Objetivo principal" value={labelGoal(s.primary_english_goal)} />
              {s.english_goals.filter((g) => g !== s.primary_english_goal).length > 0 && (
                <SummaryRow
                  label="Também quer praticar"
                  value={s.english_goals.filter((g) => g !== s.primary_english_goal).map(labelGoal).join(", ")}
                />
              )}
              {hasAreas && (
                <SummaryRow
                  label="Área principal"
                  value={labelArea(s.primary_professional_area, s.custom_professional_area)}
                />
              )}
              {s.preferred_situations.length > 0 && (
                <SummaryRow label="Situações" value={s.preferred_situations.map(labelSituation).join(", ")} />
              )}
              {s.technical_terms.length > 0 && (
                <SummaryRow label="Termos" value={s.technical_terms.join(", ")} />
              )}
              <SummaryRow label="Nível" value={labelLevel(s.english_level)} />
              <SummaryRow label="Correção" value={labelCorrection(s.correction_preference)} />
              <SummaryRow label="Meta" value={labelPracticeGoal(s.practice_goal)} />
            </div>
          </Step>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || submitting}>
          <ArrowLeft className="mr-1 size-4" /> Voltar
        </Button>
        <Button onClick={next} disabled={!canNext || submitting}>
          {current === "summary"
            ? submitting
              ? "Salvando..."
              : editMode
              ? "Salvar alterações"
              : "Começar com Lucas"
            : "Avançar"}
          <ArrowRight className="ml-1 size-4" />
        </Button>
      </div>
    </div>
  );
}

function Step({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold md:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function MultiGrid({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string; hint?: string }[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={cn(
              "flex items-center justify-between rounded-xl border bg-card/60 p-4 text-left transition",
              on ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50",
            )}
          >
            <div>
              <p className="font-medium">{o.label}</p>
              {o.hint && <p className="text-xs text-muted-foreground">{o.hint}</p>}
            </div>
            {on && <Check className="size-4 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

function SingleGrid({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center justify-between rounded-xl border bg-card/60 p-4 text-left transition",
              on ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50",
            )}
          >
            <div>
              <p className="font-medium">{o.label}</p>
              {o.hint && <p className="text-xs text-muted-foreground">{o.hint}</p>}
            </div>
            {on && <Check className="size-4 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

function TermsInput({ terms, onChange }: { terms: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (terms.includes(v)) { setDraft(""); return; }
    if (terms.length >= 30) return;
    onChange([...terms, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          }}
          placeholder="Digite um termo e aperte Enter..."
        />
        <Button type="button" variant="secondary" onClick={add}>
          <Plus className="size-4" />
        </Button>
      </div>
      {terms.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {terms.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs">
              {t}
              <button
                type="button"
                onClick={() => onChange(terms.filter((x) => x !== t))}
                className="rounded-full p-0.5 hover:bg-background"
                aria-label={`Remover ${t}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
