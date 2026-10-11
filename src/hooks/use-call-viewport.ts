import { useEffect, useRef } from "react";

/** Only sizes the voice-call surface; it never touches the audio lifecycle. */
export function useCallViewport(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const element = ref.current;
    if (!element) return;
    const viewport = window.visualViewport;
    const update = () => {
      element.style.setProperty("--call-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
    };
    update();
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      element.style.removeProperty("--call-viewport-height");
    };
  }, [active]);
  return ref;
}