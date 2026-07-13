import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAppSettings } from "@/lib/use-app-settings";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 w-8 text-sm",
  md: "h-10 w-10 text-base",
  lg: "h-12 w-12 text-lg",
};

export function LucasAvatar({
  size = "sm",
  className,
  alt = "Lucas",
}: {
  size?: Size;
  className?: string;
  alt?: string;
}) {
  const { data } = useAppSettings();
  const url = data?.lucas_avatar_url ?? null;
  const [failed, setFailed] = useState(false);
  const showImage = url && !failed;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground ring-1 ring-border/60 font-bold",
        SIZE_CLASSES[size],
        className,
      )}
      aria-label={alt}
    >
      {showImage ? (
        <img
          src={url}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>L</span>
      )}
    </span>
  );
}

export function LucasBrand({
  linkTo = "/",
  size = "sm",
  className,
}: {
  linkTo?: string;
  size?: Size;
  className?: string;
}) {
  const { data } = useAppSettings();
  const name = data?.brand_name ?? "Speak With Lucas";
  return (
    <Link to={linkTo} className={cn("flex items-center gap-2 font-display text-lg font-bold", className)}>
      <LucasAvatar size={size} />
      {name}
    </Link>
  );
}
