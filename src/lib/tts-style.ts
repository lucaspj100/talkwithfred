// Shared style guidance for Fred's TTS voice. Kept in a tiny module so both
// /api/tts and /api/tts-stream stay identical without duplicating the string.
export const FRED_TTS_VOICE = "verse";

export const FRED_TTS_INSTRUCTIONS = [
  "Speak in warm, natural, conversational English — like an upbeat friend chatting,",
  "not reading a script. Use varied intonation, gentle emphasis on key words, and",
  "brief natural pauses between phrases. Sound relaxed, friendly, and encouraging;",
  "never robotic, flat, or monotone. Keep pacing easy, as if speaking to one person",
  "you're happy to hear from.",
].join(" ");
