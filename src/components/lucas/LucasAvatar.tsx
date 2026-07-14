import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAppSettings } from "@/lib/use-app-settings";

export type LucasAvatarStatus = "idle" | "listening" | "thinking" | "speaking";
export type LucasAvatarSize = "small" | "medium" | "large";

export type LucasAvatarProps = {
  status?: LucasAvatarStatus;
  /** 0-100. Reserved for Rive mouth blend when the .riv file is provided. */
  mouthLevel?: number;
  size?: LucasAvatarSize;
  showStatus?: boolean;
  className?: string;
  /**
   * Optional path to a Rive file. When provided, the component swaps the
   * placeholder for the Rive canvas without any change to the callsite.
   */
  riveSrc?: string;
};

const SIZE_MAP: Record<LucasAvatarSize, { box: string; text: string; label: string }> = {
  small: { box: "h-20 w-20", text: "text-2xl", label: "text-xs" },
  medium: { box: "h-32 w-32 md:h-36 md:w-36", text: "text-4xl", label: "text-sm" },
  large: { box: "h-40 w-40 md:h-52 md:w-52", text: "text-6xl", label: "text-base" },
};

const STATUS_LABEL: Record<LucasAvatarStatus, string> = {
  idle: "Lucas está pronto",
  listening: "Lucas está ouvindo…",
  thinking: "Lucas está preparando a resposta…",
  speaking: "Lucas está falando…",
};

export function LucasAvatar({
  status = "idle",
  mouthLevel = 0,
  size = "medium",
  showStatus = true,
  className,
  riveSrc,
}: LucasAvatarProps) {
  const sz = SIZE_MAP[size];

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center",
          sz.box,
        )}
        data-status={status}
      >
        {/* Outer glow ring — animates per status */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full transition-all duration-300",
            status === "listening" && "animate-pulse-ring bg-primary/25",
            status === "thinking" && "animate-thinking-ring bg-amber-400/25",
            status === "speaking" && "animate-speaking-ring bg-primary/30",
            status === "idle" && "bg-primary/10",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "absolute inset-2 rounded-full transition-all duration-300",
            status === "listening" && "ring-2 ring-primary/60 animate-pulse",
            status === "speaking" && "ring-2 ring-primary/80",
            status === "thinking" && "ring-2 ring-amber-400/70",
            status === "idle" && "ring-1 ring-border/60",
          )}
        />

        {/* Avatar body */}
        <div
          className={cn(
            "relative z-10 flex items-center justify-center overflow-hidden rounded-full h-[85%] w-[85%] bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg ring-1 ring-border/40",
            status === "speaking" && "animate-speaking-bob",
            status === "thinking" && "animate-thinking-tilt",
          )}
          style={
            status === "speaking" && mouthLevel > 0
              ? { transform: `scale(${1 + Math.min(mouthLevel, 100) / 800})` }
              : undefined
          }
        >
          {riveSrc ? (
            <RivePlaceholder src={riveSrc} status={status} mouthLevel={mouthLevel} />
          ) : (
            <PlaceholderFace sizeClass={sz.text} status={status} />
          )}
        </div>
      </div>

      {showStatus && (
        <p
          className={cn(
            "font-medium text-muted-foreground transition-opacity",
            sz.label,
          )}
          aria-live="polite"
        >
          {STATUS_LABEL[status]}
        </p>
      )}
    </div>
  );
}

function PlaceholderFace({
  sizeClass,
  status,
}: {
  sizeClass: string;
  status: LucasAvatarStatus;
}) {
  const { data } = useAppSettings();
  const url = data?.lucas_avatar_url ?? null;
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt="Lucas"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <span className={cn("font-display font-bold", sizeClass)}>L</span>
      {/* Blinking dot / listening indicator */}
      {status === "listening" && (
        <span className="absolute bottom-3 h-2 w-2 rounded-full bg-white/90 animate-ping" />
      )}
      {status === "thinking" && (
        <span className="absolute bottom-3 flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-white/90 animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/90 animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/90 animate-bounce" />
        </span>
      )}
    </div>
  );
}

/**
 * Placeholder wrapper for the future Rive canvas. Kept isolated so the swap
 * to `@rive-app/react-webgl2` only touches this component — the parent screen
 * remains untouched.
 */
function RivePlaceholder({
  src,
  status,
  mouthLevel,
}: {
  src: string;
  status: LucasAvatarStatus;
  mouthLevel: number;
}) {
  // Lazy-load the Rive runtime only when a src is provided.
  const [Comp, setComp] = useState<null | React.ComponentType<{
    src: string;
    stateMachines?: string;
    artboard?: string;
    className?: string;
  }>>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@rive-app/react-webgl2")
      .then((mod) => {
        if (!cancelled) setComp(() => mod.default);
      })
      .catch(() => {
        // Fall back silently to the placeholder.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Data attrs let a future Rive state machine read status / mouth via inputs.
  return (
    <div
      className="h-full w-full"
      data-status={status}
      data-mouth-level={mouthLevel}
    >
      {Comp ? (
        <Comp src={src} className="h-full w-full" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="font-display text-4xl font-bold">L</span>
        </div>
      )}
    </div>
  );
}
