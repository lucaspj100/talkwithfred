import { useCallback, useEffect, useRef, useState } from "react";
import {
  playExerciseFeedback,
  getSoundEnabled,
  setSoundEnabled,
  getVibrationEnabled,
  setVibrationEnabled,
  type FeedbackType,
} from "@/lib/exercise-feedback";

/**
 * Reusable hook for exercise feedback.
 * - `play(type, key?)` triggers sound+vibration, deduped by `key`
 *   (attempt/item id) so re-renders never double-play.
 * - Preferences reactively update across mounted components.
 */
export function useExerciseFeedback() {
  const [soundEnabled, setSound] = useState<boolean>(() => getSoundEnabled());
  const [vibrationEnabled, setVibration] = useState<boolean>(() => getVibrationEnabled());
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    function sync() {
      setSound(getSoundEnabled());
      setVibration(getVibrationEnabled());
    }
    window.addEventListener("twf:prefs-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("twf:prefs-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const play = useCallback((type: FeedbackType, dedupeKey?: string) => {
    if (dedupeKey) {
      const k = `${type}:${dedupeKey}`;
      if (lastKeyRef.current === k) return;
      lastKeyRef.current = k;
    }
    playExerciseFeedback(type);
  }, []);

  const toggleSound = useCallback(() => {
    const next = !getSoundEnabled();
    setSoundEnabled(next);
    return next;
  }, []);

  const toggleVibration = useCallback(() => {
    const next = !getVibrationEnabled();
    setVibrationEnabled(next);
    return next;
  }, []);

  return {
    play,
    soundEnabled,
    vibrationEnabled,
    toggleSound,
    toggleVibration,
    setSoundEnabled,
    setVibrationEnabled,
  };
}
