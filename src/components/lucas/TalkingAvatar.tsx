import { cn } from "@/lib/utils";
import { LucasAvatar as LucasBrandImage } from "@/components/LucasBrand";

export type TalkingAvatarState = "idle" | "listening" | "thinking" | "speaking";
export type TalkingAvatarSize = "small" | "medium" | "large";

export type TalkingAvatarProps = {
  state?: TalkingAvatarState;
  /** Kept for API compatibility; not used (mouth is not animated). */
  mouthLevel?: number;
  size?: TalkingAvatarSize;
  showStatus?: boolean;
  className?: string;
};

const SIZE_BOX: Record<TalkingAvatarSize, string> = {
  small: "h-20 w-20",
  medium: "h-32 w-32 md:h-36 md:w-36",
  large: "h-40 w-40 md:h-52 md:w-52",
};

const STATE_LABEL: Record<TalkingAvatarState, string> = {
  idle: "Lucas está pronto",
  listening: "Lucas está ouvindo…",
  thinking: "Lucas está preparando a resposta…",
  speaking: "Lucas está falando…",
};

// Map to the fred-ring data-state used by the shared CSS animations.
const STATE_TO_RING: Record<TalkingAvatarState, "neutral" | "listening" | "thinking" | "responding"> = {
  idle: "neutral",
  listening: "listening",
  thinking: "thinking",
  speaking: "responding",
};

/**
 * Circular Lucas avatar built around the brand image (from app settings).
 * The surrounding `fred-ring` reacts to the conversation state; the image
 * itself has a subtle idle breathing motion. No mouth animation.
 */
export function TalkingAvatar({
  state = "idle",
  size = "medium",
  showStatus = false,
  className,
}: TalkingAvatarProps) {
  const box = SIZE_BOX[size];
  const ring = STATE_TO_RING[state];

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div className={cn("fred-ring", box)} data-state={ring}>
        <LucasBrandImage
          alt="Lucas"
          className={cn(
            "h-full w-full ring-0 animate-idle-breathe",
            state === "speaking" && "animate-head-bob",
          )}
        />
      </div>
      {showStatus && (
        <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {STATE_LABEL[state]}
        </p>
      )}
    </div>
  );
}
