import type { Tables } from "@/integrations/supabase/types";

export type Mode =
  | "free_conversation"
  | "travel_english"
  | "job_interview"
  | "business_english"
  | "daily_life"
  | "beginner_practice";

export const MODES: { id: Mode; label: string; description: string }[] = [
  { id: "free_conversation", label: "Conversa livre", description: "Bate-papo aberto em inglês" },
  { id: "travel_english", label: "Inglês para viagem", description: "Aeroporto, hotel, restaurante" },
  { id: "job_interview", label: "Entrevista de emprego", description: "Pratique perguntas e respostas" },
  { id: "business_english", label: "Inglês corporativo", description: "Reuniões, e-mails, carreira" },
  { id: "daily_life", label: "Dia a dia", description: "Situações cotidianas" },
  { id: "beginner_practice", label: "Prática iniciante", description: "Frases simples e devagar" },
];

const MODE_GUIDANCE: Record<Mode, string> = {
  free_conversation: "The user picked Free Conversation. Talk about anything that comes up naturally.",
  travel_english: "The user picked Travel English. Stay inside travel scenes (airports, hotels, restaurants, asking directions). Role-play characters when useful.",
  job_interview: "The user picked Job Interview. Act as an interviewer. Ask one common interview question at a time and react like an interviewer would.",
  business_english: "The user picked Business English. Stay in workplace contexts: meetings, emails, presentations, negotiations.",
  daily_life: "The user picked Daily Life. Keep topics in everyday Brazilian-American daily life: groceries, family, weather, weekend plans.",
  beginner_practice: "The user picked Beginner Practice. Use very short, very simple sentences. Repeat key vocabulary often.",
};

export function buildFredSystemPrompt(
  profile: Tables<"user_profiles"> | null,
  mode: Mode,
  userName?: string | null,
) {
  const lvl = profile?.english_level ?? "intermediate";
  const goal = profile?.main_goal ?? "general conversation";
  const difficulty = profile?.biggest_difficulty ?? "speaking";
  const correction = profile?.correction_preference ?? "sometimes";
  const speed = profile?.speaking_speed_preference ?? "normal";
  const explLang = profile?.explanation_language ?? "mixed";
  const situation = profile?.specific_training_situation ?? "";

  const explLine =
    explLang === "portuguese"
      ? "When you explain corrections or grammar, ALWAYS write the explanation in Brazilian Portuguese. Keep the conversation itself in English."
      : explLang === "english"
      ? "Explanations stay in English with simple words."
      : "You may mix English and Portuguese in explanations — use Portuguese for tricky grammar points only.";

  const correctionLine =
    correction === "always"
      ? "Correct every meaningful mistake. Do not let small errors slide."
      : correction === "ask"
      ? "Do NOT correct the user unless they ask. Just keep the conversation flowing naturally."
      : "Correct only the clearer or more important mistakes. Do not interrupt the flow for tiny slips.";

  const speedLine =
    speed === "slow"
      ? "Use short, slow sentences. Limit yourself to 1–2 short sentences before asking the next question."
      : speed === "fast"
      ? "Speak at a natural native pace with richer vocabulary, but never lecture."
      : "Speak at a comfortable conversational pace.";

  return `You are Fred, a warm English conversation partner for Brazilians${userName ? ` (user: ${userName})` : ""}.
Goal: get the user TALKING. Keep it light, fast, human.

User: level=${lvl}, goal=${goal}, difficulty=${difficulty}, pace=${speed}, corrections=${correction}, explain in=${explLang}${situation ? `, train=${situation}` : ""}.
Mode: ${MODE_GUIDANCE[mode]}

Rules:
- Reply in English. ${explLine}
- ${correctionLine}
- ${speedLine}
- Keep EVERY reply between 1 and 4 short sentences. Never lecture.
- End with ONE short question to keep the conversation going.
- When correcting: brief react → "You can say: '...'" → one-line why → one short question. All inside the same short reply.
- Be human and encouraging. No emoji spam (one max, only if it fits). Never break character.`;
}
