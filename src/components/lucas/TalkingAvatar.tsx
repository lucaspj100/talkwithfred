import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { LucasAvatar, type LucasAvatarStatus, type LucasAvatarSize } from "./LucasAvatar";

export type TalkingAvatarState = "idle" | "listening" | "thinking" | "speaking";

export type TalkingAvatarProps = {
  state?: TalkingAvatarState;
  /** 0-100. Only used while state === "speaking" to drive mouth shape in the SVG fallback. */
  mouthLevel?: number;
  size?: LucasAvatarSize;
  showStatus?: boolean;
  className?: string;
  /** Optional override. Defaults to `/src/assets/lucas-avatar.riv`. */
  riveSrc?: string;
};

// Map the shared conversation state to the fallback SVG statuses.
const STATE_TO_STATUS: Record<TalkingAvatarState, LucasAvatarStatus> = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
};

// State machine input names we try to drive on the Rive artboard, when present.
const RIVE_STATE_MACHINE = "State Machine 1";
const RIVE_STATE_INPUT = "state"; // number: 0 idle, 1 listening, 2 thinking, 3 speaking
const RIVE_MOUTH_INPUT = "mouth"; // number: 0-100

const STATE_TO_NUMBER: Record<TalkingAvatarState, number> = {
  idle: 0,
  listening: 1,
  thinking: 2,
  speaking: 3,
};

/**
 * Reusable talking avatar for Lucas. Uses a Rive file when available
 * (`src/assets/lucas-avatar.riv`) and falls back to the animated SVG face
 * otherwise. The public API is the single `state` prop, so callsites do
 * not need to know whether Rive is loaded.
 */
export function TalkingAvatar({
  state = "idle",
  mouthLevel = 0,
  size = "medium",
  showStatus = false,
  className,
  riveSrc,
}: TalkingAvatarProps) {
  const status = STATE_TO_STATUS[state];
  const [riveModule, setRiveModule] = useState<null | typeof import("@rive-app/react-webgl2")>(null);
  const [riveAvailable, setRiveAvailable] = useState<boolean | null>(null);

  const resolvedSrc = riveSrc ?? "/src/assets/lucas-avatar.riv";

  // Lazy-load the Rive runtime and confirm the .riv file actually exists.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const head = await fetch(resolvedSrc, { method: "HEAD" });
        if (cancelled) return;
        if (!head.ok) {
          setRiveAvailable(false);
          return;
        }
        const mod = await import("@rive-app/react-webgl2");
        if (cancelled) return;
        setRiveModule(mod);
        setRiveAvailable(true);
      } catch {
        if (!cancelled) setRiveAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedSrc]);

  const useRive = riveAvailable === true && riveModule !== null;

  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      {useRive ? (
        <RiveAvatar
          module={riveModule}
          src={resolvedSrc}
          state={state}
          mouthLevel={mouthLevel}
          size={size}
        />
      ) : (
        <LucasAvatar
          status={status}
          mouthLevel={state === "speaking" ? mouthLevel : 0}
          size={size}
          showStatus={showStatus}
        />
      )}
    </div>
  );
}

const SIZE_BOX: Record<LucasAvatarSize, string> = {
  small: "h-20 w-20",
  medium: "h-32 w-32 md:h-36 md:w-36",
  large: "h-40 w-40 md:h-52 md:w-52",
};

function RiveAvatar({
  module: mod,
  src,
  state,
  mouthLevel,
  size,
}: {
  module: typeof import("@rive-app/react-webgl2");
  src: string;
  state: TalkingAvatarState;
  mouthLevel: number;
  size: LucasAvatarSize;
}) {
  const { useRive, useStateMachineInput } = mod;
  const { rive, RiveComponent } = useRive({
    src,
    stateMachines: RIVE_STATE_MACHINE,
    autoplay: true,
  });

  const stateInput = useStateMachineInput(rive, RIVE_STATE_MACHINE, RIVE_STATE_INPUT);
  const mouthInput = useStateMachineInput(rive, RIVE_STATE_MACHINE, RIVE_MOUTH_INPUT);

  useEffect(() => {
    if (stateInput) stateInput.value = STATE_TO_NUMBER[state];
  }, [state, stateInput]);

  useEffect(() => {
    if (mouthInput) {
      mouthInput.value = state === "speaking" ? Math.max(0, Math.min(100, mouthLevel)) : 0;
    }
  }, [mouthLevel, state, mouthInput]);

  return (
    <div className={cn("flex items-center justify-center", SIZE_BOX[size])}>
      <RiveComponent className="h-full w-full" />
    </div>
  );
}
