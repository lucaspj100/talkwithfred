// Central tuning for voice-turn detection. Adjust here to change behavior
// across both the realtime session config (server-side VAD) and the
// client-side transcription validation.

/** How long the user can pause mid-thought before we treat speech as ended. */
export const END_OF_SPEECH_SILENCE_MS = 1800;

/** Minimum length of a valid speech turn. Shorter blips are treated as noise. */
export const MINIMUM_SPEECH_DURATION_MS = 500;

/** VAD activation threshold (0-1). Higher = less sensitive to soft ambient sound. */
export const VAD_THRESHOLD = 0.6;

/** Audio kept before speech onset, so the first phoneme isn't clipped. */
export const VAD_PREFIX_PADDING_MS = 300;

/** Isolated interjections that are almost always noise, not real speech. */
const NOISE_INTERJECTIONS = new Set([
  "ah", "hã", "ha", "hum", "é", "e", "a", "o", "um", "uh",
  "hm", "hmm", "uhm", "mm", "mhm", "oh", "eh", "ih",
]);

/**
 * Returns true when a transcription is almost certainly noise / silence and
 * should NOT be forwarded to the assistant.
 *
 * Only rejects when the *entire* transcript is an isolated interjection —
 * "ah" inside a longer sentence is preserved.
 */
export function isLikelyNoiseTranscript(text: string): boolean {
  const clean = text.trim().toLowerCase();
  if (!clean) return true;
  // Strip punctuation to check meaningful content.
  const stripped = clean.replace(/[.,!?;:"'`~\-–—\s]+/g, " ").trim();
  if (!stripped) return true;
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  if (words.length === 1) {
    const w = words[0];
    if (NOISE_INTERJECTIONS.has(w)) return true;
    // Single 1-char token that isn't a real word.
    if (w.length < 2 && !/[a-z0-9]/.test(w)) return true;
  }
  return false;
}
