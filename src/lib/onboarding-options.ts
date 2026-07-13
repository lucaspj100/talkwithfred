// Centralized options & labels for the onboarding / "Meu foco" flow.

export const ENGLISH_GOALS: { value: string; label: string }[] = [
  { value: "travel", label: "Viagens" },
  { value: "career", label: "Trabalho / carreira" },
  { value: "job_interview", label: "Entrevistas de emprego" },
  { value: "business_meetings", label: "Reuniões de negócio" },
  { value: "presentations", label: "Apresentações" },
  { value: "study", label: "Estudos / faculdade" },
  { value: "daily_conversation", label: "Conversação do dia a dia" },
  { value: "living_abroad", label: "Morar fora" },
  { value: "certification", label: "Prova / certificação" },
  { value: "culture", label: "Cultura / filmes / séries / música" },
  { value: "other", label: "Outro" },
];

export const PROFESSIONAL_AREAS: { value: string; label: string }[] = [
  { value: "sales", label: "Vendas" },
  { value: "tech", label: "Tecnologia" },
  { value: "marketing", label: "Marketing" },
  { value: "business", label: "Negócios / empreendedorismo" },
  { value: "customer_service", label: "Atendimento ao cliente" },
  { value: "hr", label: "Recursos Humanos" },
  { value: "finance", label: "Finanças" },
  { value: "health", label: "Saúde" },
  { value: "legal", label: "Jurídico" },
  { value: "engineering", label: "Engenharia" },
  { value: "education", label: "Educação" },
  { value: "tourism", label: "Turismo / hotelaria" },
  { value: "sports", label: "Esportes" },
  { value: "academic", label: "Área acadêmica" },
  { value: "other", label: "Outro" },
  { value: "none", label: "Não quero direcionar para uma área agora" },
];

export const GENERAL_SITUATIONS: { value: string; label: string }[] = [
  { value: "daily_chat", label: "Conversas do dia a dia" },
  { value: "self_intro", label: "Apresentação pessoal" },
  { value: "meetings", label: "Reuniões" },
  { value: "interviews", label: "Entrevistas" },
  { value: "travel_general", label: "Viagens" },
  { value: "airport", label: "Aeroporto" },
  { value: "hotel", label: "Hotel" },
  { value: "restaurant", label: "Restaurante" },
  { value: "work_general", label: "Trabalho" },
  { value: "emails", label: "E-mails profissionais" },
  { value: "presentations", label: "Apresentações" },
  { value: "negotiation", label: "Negociação" },
  { value: "customer_support", label: "Atendimento ao cliente" },
  { value: "phone_calls", label: "Telefonemas / chamadas" },
];

export const AREA_SITUATIONS: Record<string, { value: string; label: string }[]> = {
  sales: [
    { value: "sales_pitch", label: "Pitch de vendas" },
    { value: "objection_handling", label: "Lidar com objeções" },
    { value: "follow_up", label: "Fazer follow-up" },
    { value: "proposal", label: "Apresentar proposta" },
    { value: "negotiation_price", label: "Negociar preço" },
    { value: "closing", label: "Fechar uma venda" },
    { value: "decision_maker_talk", label: "Conversar com decisores" },
    { value: "explain_product", label: "Explicar um produto/serviço" },
  ],
  tech: [
    { value: "daily_meeting", label: "Daily meeting" },
    { value: "explain_bug", label: "Explicar um bug" },
    { value: "api_talk", label: "Falar sobre uma API" },
    { value: "tech_project", label: "Apresentar um projeto técnico" },
    { value: "tech_interview", label: "Entrevista técnica" },
    { value: "deploy_talk", label: "Falar sobre deploy" },
    { value: "requirements", label: "Explicar requisitos" },
    { value: "sprint_backlog", label: "Discutir sprint/backlog" },
  ],
  marketing: [
    { value: "campaign", label: "Apresentar campanha" },
    { value: "leads", label: "Falar sobre leads" },
    { value: "metrics", label: "Explicar métricas" },
    { value: "branding", label: "Branding" },
    { value: "funnel", label: "Funil de vendas" },
    { value: "paid_media", label: "Tráfego pago" },
    { value: "content", label: "Conteúdo" },
    { value: "conversion", label: "Conversão" },
  ],
  hr: [
    { value: "interviews", label: "Entrevistas" },
    { value: "feedback", label: "Feedback" },
    { value: "onboarding", label: "Onboarding" },
    { value: "culture", label: "Cultura" },
    { value: "performance", label: "Performance" },
    { value: "recruiting", label: "Recrutamento" },
    { value: "career_plan", label: "Plano de carreira" },
  ],
};

export const ENGLISH_LEVELS: { value: string; label: string; hint?: string }[] = [
  { value: "beginner", label: "Iniciante", hint: "Mal começo frases" },
  { value: "basic", label: "Básico", hint: "Frases simples" },
  { value: "intermediate", label: "Intermediário", hint: "Dia a dia" },
  { value: "advanced", label: "Avançado", hint: "Falo com fluência" },
  { value: "unknown", label: "Não sei", hint: "Lucas descobre comigo" },
];

export const CORRECTION_PREFS: { value: string; label: string; hint: string }[] = [
  { value: "light", label: "Corrigir pouco", hint: "Para a conversa fluir" },
  { value: "balanced", label: "Equilibrado", hint: "Pega o essencial" },
  { value: "heavy", label: "Bastante, como professor", hint: "Não deixa passar nada" },
  { value: "after", label: "Só depois da conversa", hint: "Não interrompe" },
];

export const PRACTICE_GOALS: { value: string; label: string }[] = [
  { value: "5min", label: "5 minutos por dia" },
  { value: "10min", label: "10 minutos por dia" },
  { value: "15min", label: "15 minutos por dia" },
  { value: "3x_week", label: "3 vezes por semana" },
  { value: "flexible", label: "Apenas quando eu puder" },
];

function asMap<T extends { value: string; label: string }>(arr: T[]) {
  return Object.fromEntries(arr.map((o) => [o.value, o.label]));
}

const SITUATIONS_MAP: Record<string, string> = {
  ...asMap(GENERAL_SITUATIONS),
  ...Object.values(AREA_SITUATIONS).reduce<Record<string, string>>(
    (acc, list) => ({ ...acc, ...asMap(list) }),
    {},
  ),
};

export const LABELS = {
  goals: asMap(ENGLISH_GOALS),
  areas: asMap(PROFESSIONAL_AREAS),
  situations: SITUATIONS_MAP,
  levels: asMap(ENGLISH_LEVELS),
  corrections: asMap(CORRECTION_PREFS),
  practiceGoals: asMap(PRACTICE_GOALS),
};

export function labelGoal(v?: string | null) { return v ? (LABELS.goals[v] ?? v) : ""; }
export function labelArea(v?: string | null, custom?: string | null) {
  if (!v) return "";
  if (v === "other" && custom) return custom;
  return LABELS.areas[v] ?? v;
}
export function labelSituation(v: string) { return LABELS.situations[v] ?? v; }
export function labelLevel(v?: string | null) { return v ? (LABELS.levels[v] ?? v) : ""; }
export function labelCorrection(v?: string | null) { return v ? (LABELS.corrections[v] ?? v) : ""; }
export function labelPracticeGoal(v?: string | null) { return v ? (LABELS.practiceGoals[v] ?? v) : ""; }

// Map new correction prefs → legacy enum so existing fred-prompt code keeps working.
export function correctionToLegacy(v: string): "always" | "sometimes" | "ask" {
  if (v === "heavy") return "always";
  if (v === "balanced") return "sometimes";
  return "ask"; // light + after
}

// Map new level → legacy enum (legacy doesn't know "unknown").
export function levelToLegacy(v: string): "beginner" | "basic" | "intermediate" | "advanced" {
  if (v === "unknown") return "basic";
  return (v as never) ?? "intermediate";
}
