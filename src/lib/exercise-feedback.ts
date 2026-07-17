/**
 * Exercise feedback: short synthesized tones + optional vibration.
 * Uses Web Audio API so no audio assets are required. Preferences are
 * persisted in localStorage. All errors are swallowed silently so audio
 * failures never break the exercise flow.
 */

export type FeedbackType = "correct" | "incorrect" | "close" | "completed";

const SOUND_KEY = "twf.prefs.exerciseSound";
const VIB_KEY = "twf.prefs.exerciseVibration";

export function getSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(SOUND_KEY);
  return v === null ? true : v === "1";
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SOUND_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent("twf:prefs-changed"));
}

export function getVibrationEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(VIB_KEY);
  return v === null ? true : v === "1";
}

export function setVibrationEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VIB_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent("twf:prefs-changed"));
}

// --- Web Audio synthesis ---

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, startOffset: number, durationMs: number, gain = 0.12, type: OscillatorType = "sine") {
  const c = getCtx();
  if (!c) return;
  try {
    const now = c.currentTime + startOffset / 1000;
    const dur = durationMs / 1000;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(c.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  } catch {
    /* ignore */
  }
}

function playPattern(type: FeedbackType) {
  switch (type) {
    case "correct":
      // Bright two-note lift: E5 → A5
      tone(659.25, 0, 110, 0.14, "sine");
      tone(880.0, 90, 180, 0.14, "sine");
      break;
    case "close":
      // Neutral single soft blip
      tone(523.25, 0, 180, 0.09, "triangle");
      break;
    case "incorrect":
      // Gentle low descending pair, soft
      tone(349.23, 0, 160, 0.09, "triangle");
      tone(261.63, 130, 200, 0.08, "triangle");
      break;
    case "completed":
      // Small fanfare: C5 → E5 → G5
      tone(523.25, 0, 110, 0.13, "sine");
      tone(659.25, 90, 110, 0.13, "sine");
      tone(783.99, 180, 260, 0.14, "sine");
      break;
  }
}

function vibrate(type: FeedbackType) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  // Skip vibration on desktop (no touch primary pointer).
  try {
    const isMobile = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (!isMobile) return;
  } catch {
    /* ignore */
  }
  try {
    switch (type) {
      case "correct":
        nav.vibrate(40);
        break;
      case "close":
        nav.vibrate(30);
        break;
      case "incorrect":
        nav.vibrate([50, 40, 50]);
        break;
      case "completed":
        nav.vibrate([30, 40, 30, 40, 60]);
        break;
    }
  } catch {
    /* ignore */
  }
}

/** Play sound + vibration for a feedback verdict, respecting user prefs. */
export function playExerciseFeedback(type: FeedbackType) {
  try {
    if (getSoundEnabled()) playPattern(type);
    if (getVibrationEnabled()) vibrate(type);
  } catch {
    /* ignore */
  }
}
