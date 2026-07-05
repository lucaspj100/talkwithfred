export const AREAS = [
  { value: "tech", label: "Tecnologia" },
  { value: "data", label: "Dados" },
  { value: "product", label: "Produto" },
  { value: "sales", label: "Comercial" },
  { value: "finance", label: "Financeiro" },
  { value: "hr", label: "RH" },
  { value: "engineering", label: "Engenharia" },
  { value: "management", label: "Gestão" },
  { value: "health", label: "Saúde" },
  { value: "other", label: "Outro" },
] as const;

export const GOALS = [
  { value: "career_growth", label: "Crescer na carreira" },
  { value: "promotion", label: "Promoção" },
  { value: "job_interview", label: "Entrevista de emprego" },
  { value: "international_role", label: "Vaga internacional" },
  { value: "earn_foreign", label: "Ganhar em dólar/euro" },
  { value: "meetings", label: "Reuniões profissionais" },
  { value: "travel", label: "Viagem" },
  { value: "confidence", label: "Segurança para falar" },
] as const;

export const LEVELS = [
  { value: "basic", label: "Básico" },
  { value: "intermediate_stuck", label: "Intermediário travado" },
  { value: "intermediate", label: "Intermediário" },
  { value: "advanced_insecure", label: "Avançado, mas sem segurança" },
  { value: "unsure", label: "Não sei dizer" },
] as const;

export const BLOCKS = [
  { value: "speaking", label: "Fala" },
  { value: "listening", label: "Escuta" },
  { value: "interviews", label: "Entrevistas" },
  { value: "meetings", label: "Reuniões" },
  { value: "presentations", label: "Apresentações" },
  { value: "shame", label: "Vergonha de falar" },
  { value: "consistency", label: "Constância" },
  { value: "international_jobs", label: "Vagas internacionais" },
] as const;

export const LOST_OPPORTUNITY = [
  { value: "yes", label: "Sim" },
  { value: "considered", label: "Já pensei, mas recuei" },
  { value: "no", label: "Não" },
  { value: "never_looked", label: "Nunca procurei esse tipo de oportunidade" },
] as const;

function pick<T extends { value: string; label: string }>(list: readonly T[], v: string | null | undefined) {
  return list.find((o) => o.value === v)?.label ?? "";
}
export const labelArea = (v?: string | null) => pick(AREAS, v);
export const labelGoalSim = (v?: string | null) => pick(GOALS, v);
export const labelLevelSim = (v?: string | null) => pick(LEVELS, v);
export const labelBlock = (v?: string | null) => pick(BLOCKS, v);
export const labelLostOpp = (v?: string | null) => pick(LOST_OPPORTUNITY, v);

export type SimulationScenario = {
  scene: string;
  fredRole: string;
  opening: string;
};

export function scenarioForGoal(goal: string | null | undefined, area: string | null | undefined): SimulationScenario {
  const areaLabel = labelArea(area) || "sua área";
  switch (goal) {
    case "job_interview":
      return {
        scene: "job interview in English for a role in the user's area",
        fredRole: "professional interviewer at an international company",
        opening: "Hi! Thanks for joining today. To start, could you tell me a little about your background and what you're looking for in this role?",
      };
    case "international_role":
    case "earn_foreign":
      return {
        scene: "screening call with an international recruiter about a remote role",
        fredRole: "international tech recruiter",
        opening: "Hey! Great to connect. Before we dive in, tell me — what kind of international opportunity are you looking for, and why now?",
      };
    case "meetings":
      return {
        scene: `weekly meeting with an international team in ${areaLabel}`,
        fredRole: "colleague from a global team leading the meeting",
        opening: "Alright everyone, let's get started. Quick round — what did you work on this week and what are you tackling next?",
      };
    case "promotion":
    case "career_growth":
      return {
        scene: "career conversation with a manager about growth and next steps",
        fredRole: "supportive manager doing a career check-in",
        opening: "Hey, thanks for making time. Let's talk about where you want to go next. Where do you see yourself growing in the next year?",
      };
    case "travel":
      return {
        scene: "real travel situation (airport, hotel, restaurant) that a professional would face abroad",
        fredRole: "friendly local you just met while traveling for work",
        opening: "Oh, you're here on business? Nice! What brings you to town — is it your first time here?",
      };
    default:
      return {
        scene: `professional English conversation adapted to ${areaLabel}`,
        fredRole: "professional peer having a career-focused chat",
        opening: "Hey! Nice to meet you. Tell me — what are you working on right now, and what's the next thing you'd like to unlock in your career?",
      };
  }
}
