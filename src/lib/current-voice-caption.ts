import type { VoiceTurn } from "@/hooks/use-realtime-voice";

export type VoiceCaption = { role: "user" | "assistant"; text: string };

/** Presentation only: consume the existing partial/final transcript values. */
export function currentVoiceCaption({
  partialUser,
  partialAssistant,
  userSpeaking,
  turns,
  history,
}: {
  partialUser: string;
  partialAssistant: string;
  userSpeaking: boolean;
  turns: VoiceTurn[];
  history: { role: "user" | "assistant"; content: string }[];
}): VoiceCaption | null {
  if (userSpeaking) {
    // Do not replace the last visible caption with an interrupted Fred partial.
    return partialUser.trim() ? { role: "user", text: partialUser } : null;
  }
  if (partialAssistant.trim()) return { role: "assistant", text: partialAssistant };
  if (partialUser.trim()) return { role: "user", text: partialUser };
  const latestTurn = [...turns].reverse().find((turn) => turn.text.trim().length > 0);
  if (latestTurn) return { role: latestTurn.role, text: latestTurn.text };
  const latestHistory = [...history].reverse().find((message) => message.content.trim().length > 0);
  return latestHistory ? { role: latestHistory.role, text: latestHistory.content } : null;
}