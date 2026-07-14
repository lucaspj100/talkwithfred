import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type LucasAvatarStatus = "idle" | "listening" | "thinking" | "speaking";
export type LucasAvatarSize = "small" | "medium" | "large";

export type LucasAvatarProps = {
  status?: LucasAvatarStatus;
  /** 0-100. Drives mouth shape when status === "speaking". */
  mouthLevel?: number;
  size?: LucasAvatarSize;
  showStatus?: boolean;
  className?: string;
  /**
   * Optional path to a Rive file. When provided, the component swaps the
   * SVG face for the Rive canvas without any change to the callsite.
   */
  riveSrc?: string;
};

const SIZE_MAP: Record<LucasAvatarSize, { box: string; label: string }> = {
  small: { box: "h-20 w-20", label: "text-xs" },
  medium: { box: "h-32 w-32 md:h-36 md:w-36", label: "text-sm" },
  large: { box: "h-40 w-40 md:h-52 md:w-52", label: "text-base" },
};

const STATUS_LABEL: Record<LucasAvatarStatus, string> = {
  idle: "Lucas está pronto",
  listening: "Lucas está ouvindo…",
  thinking: "Lucas está preparando a resposta…",
  speaking: "Lucas está falando…",
};

type MouthShape = "closed" | "small" | "medium" | "open";

function mouthShapeFromLevel(level: number): MouthShape {
  if (level <= 15) return "closed";
  if (level <= 40) return "small";
  if (level <= 70) return "medium";
  return "open";
}

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
        className={cn("relative flex items-center justify-center", sz.box)}
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

        {/* Avatar face container — NO scale on mouth movement */}
        <div
          className={cn(
            "relative z-10 flex items-center justify-center overflow-hidden rounded-full h-[85%] w-[85%] bg-gradient-to-br from-primary to-primary/70 shadow-lg ring-1 ring-border/40",
            // Only very light head motion — never scaled by mouth
            status === "speaking" && "animate-head-bob",
            status === "thinking" && "animate-thinking-tilt",
            status === "idle" && "animate-idle-breathe",
            status === "listening" && "animate-idle-breathe",
          )}
        >
          {riveSrc ? (
            <RivePlaceholder src={riveSrc} status={status} mouthLevel={mouthLevel} />
          ) : (
            <LucasFace status={status} mouthLevel={mouthLevel} />
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

/**
 * Layered 2D face — SVG. Every visual element is a separate layer so
 * eyes, brows and mouth animate independently. No single flat image.
 */
function LucasFace({
  status,
  mouthLevel,
}: {
  status: LucasAvatarStatus;
  mouthLevel: number;
}) {
  const [blinking, setBlinking] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  // Natural blink loop — 3 to 6 s between blinks.
  useEffect(() => {
    let cancelled = false;
    const scheduleNext = () => {
      const delay = 3000 + Math.random() * 3000;
      timeoutRef.current = window.setTimeout(() => {
        if (cancelled) return;
        setBlinking(true);
        window.setTimeout(() => {
          if (cancelled) return;
          setBlinking(false);
          scheduleNext();
        }, 140);
      }, delay);
    };
    scheduleNext();
    return () => {
      cancelled = true;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const shape = status === "speaking" ? mouthShapeFromLevel(mouthLevel) : "closed";

  // Brow offset — a small, discreet raise when thinking.
  const browY = status === "thinking" ? 33 : 36;

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full"
      role="img"
      aria-label="Lucas"
    >
      {/* Head / face base */}
      <defs>
        <radialGradient id="skin" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#f6d3ad" />
          <stop offset="100%" stopColor="#e0a879" />
        </radialGradient>
        <linearGradient id="hair" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3a2418" />
          <stop offset="100%" stopColor="#5a3826" />
        </linearGradient>
      </defs>

      {/* Neck */}
      <rect x="40" y="78" width="20" height="16" rx="6" fill="url(#skin)" />

      {/* Hair back */}
      <ellipse cx="50" cy="34" rx="30" ry="26" fill="url(#hair)" />

      {/* Face base */}
      <ellipse cx="50" cy="52" rx="26" ry="30" fill="url(#skin)" />

      {/* Beard (soft shadow along jaw) */}
      <path
        d="M26 58 Q30 82 50 84 Q70 82 74 58 Q66 74 50 74 Q34 74 26 58 Z"
        fill="#3a2418"
        opacity="0.35"
      />

      {/* Hair front tuft */}
      <path
        d="M24 34 Q34 18 52 20 Q70 22 76 36 Q66 28 52 30 Q38 32 24 34 Z"
        fill="url(#hair)"
      />

      {/* Eyebrows */}
      <g
        className={cn(
          "origin-center",
          status === "thinking" && "animate-brow-flick",
        )}
      >
        <rect x="34" y={browY} width="12" height="2.4" rx="1.2" fill="#2a1810" />
        <rect x="54" y={browY} width="12" height="2.4" rx="1.2" fill="#2a1810" />
      </g>

      {/* Eyes — open */}
      {!blinking && (
        <g>
          <ellipse cx="40" cy="46" rx="3.4" ry="3.6" fill="#ffffff" />
          <ellipse cx="60" cy="46" rx="3.4" ry="3.6" fill="#ffffff" />
          <circle cx="40.5" cy="46.5" r="1.6" fill="#22150c" />
          <circle cx="60.5" cy="46.5" r="1.6" fill="#22150c" />
          <circle cx="41" cy="45.8" r="0.5" fill="#ffffff" />
          <circle cx="61" cy="45.8" r="0.5" fill="#ffffff" />
        </g>
      )}

      {/* Eyes — closed (blink) */}
      {blinking && (
        <g stroke="#2a1810" strokeWidth="1.4" strokeLinecap="round">
          <line x1="36.5" y1="46" x2="43.5" y2="46" />
          <line x1="56.5" y1="46" x2="63.5" y2="46" />
        </g>
      )}

      {/* Nose */}
      <path
        d="M50 50 Q48 58 50 62 Q52 60 51 58"
        fill="none"
        stroke="#b6845c"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* Mouth — swappable shape */}
      <Mouth shape={shape} />
    </svg>
  );
}

function Mouth({ shape }: { shape: MouthShape }) {
  // Mouth center around (50, 70).
  if (shape === "closed") {
    return (
      <path
        d="M42 70 Q50 72 58 70"
        fill="none"
        stroke="#5a2318"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    );
  }
  if (shape === "small") {
    return (
      <g>
        <ellipse cx="50" cy="70.5" rx="4.5" ry="1.6" fill="#3a1410" />
        <path
          d="M45.6 70 Q50 68.8 54.4 70"
          fill="none"
          stroke="#5a2318"
          strokeWidth="1"
        />
      </g>
    );
  }
  if (shape === "medium") {
    return (
      <g>
        <ellipse cx="50" cy="71" rx="5.5" ry="3" fill="#3a1410" />
        <path
          d="M44.5 70 Q50 68 55.5 70"
          fill="none"
          stroke="#5a2318"
          strokeWidth="1"
        />
      </g>
    );
  }
  return (
    <g>
      <ellipse cx="50" cy="72" rx="6.5" ry="4.6" fill="#2a0e0b" />
      <ellipse cx="50" cy="70" rx="5.5" ry="1" fill="#c96b56" />
    </g>
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
        // Fall back silently to the SVG face.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="h-full w-full"
      data-status={status}
      data-mouth-level={mouthLevel}
    >
      {Comp ? (
        <Comp src={src} className="h-full w-full" />
      ) : (
        <LucasFace status={status} mouthLevel={mouthLevel} />
      )}
    </div>
  );
}
