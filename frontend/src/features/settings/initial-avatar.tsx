import { cn } from "@/lib/utils";

import { avatarInitial, avatarTone, type AvatarTone } from "./avatar-tone";

const TONE_CLASSES: Record<AvatarTone, string> = {
  violet: "bg-accent-subtle text-accent",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger-text",
  neutral: "bg-surface text-muted-foreground",
};

const SIZE_CLASSES = {
  /** API key rows. */
  xs: "size-[22px] text-xs font-medium",
  /** Audit log actors. */
  sm: "size-6 text-xs font-medium",
  /** Member rows. */
  md: "size-9 text-sm font-semibold",
  /** The profile card; a little smaller on phones so a long email fits beside it. */
  lg: "size-12 text-lg font-bold sm:size-16 sm:text-h2",
} as const;

interface InitialAvatarProps {
  /** Display name or email; its first letter is shown. */
  name: string;
  /** Picks the tint, usually the user ID. */
  seed: string;
  size: keyof typeof SIZE_CLASSES;
  /** Overrides the seeded tint, e.g. muted for revoked keys. */
  tone?: AvatarTone;
  className?: string;
}

/** A round initial avatar. Decorative: the name is always shown next to it. */
export function InitialAvatar({ name, seed, size, tone, className }: InitialAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full select-none",
        TONE_CLASSES[tone ?? avatarTone(seed)],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {avatarInitial(name)}
    </span>
  );
}
