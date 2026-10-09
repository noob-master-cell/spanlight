import { useId } from "react";

import { cn } from "@/lib/utils";

type LogoTone = "on-light" | "on-dark";
type LogoSize = "md" | "lg";

interface LogoProps {
  /** `on-light` for the canvas and panels (ink tile), `on-dark` for the rail (bare mark, lime dot). */
  tone?: LogoTone;
  /** `md` is the 32px mark; `lg` is the 40px mobile app-bar mark. */
  size?: LogoSize;
  withWordmark?: boolean;
  className?: string;
}

const MARK_SIZE: Record<LogoSize, string> = { md: "size-8", lg: "size-10" };
/** Line height after the size: tailwind-merge drops a leading-* that precedes a text-* class. */
const WORDMARK_SIZE: Record<LogoSize, string> = {
  md: "text-[21px] leading-none",
  lg: "text-[26px] leading-none",
};

/**
 * The Spotlight mark plus the lowercase "spanlight" wordmark. One accessible name for the
 * whole lockup; the drawn letters are hidden from assistive tech.
 */
export function Logo({
  tone = "on-light",
  size = "md",
  withWordmark = true,
  className,
}: LogoProps) {
  return (
    <span
      role="img"
      aria-label="Spanlight"
      className={cn("inline-flex items-center", size === "lg" ? "gap-3" : "gap-2.5", className)}
    >
      <LogoMark tone={tone} size={size} />
      {withWordmark ? <Wordmark tone={tone} size={size} /> : null}
    </span>
  );
}

/**
 * "spanlight" set with a dotless ı and a separately drawn dot: lime on the rail, the text
 * colour elsewhere. The dot sits just before the ı as an inline-block with zero net advance,
 * raised from the baseline with vertical-align, so neither font metrics nor letter-spacing can
 * move it off the stem. Offsets are in em, measured from Plus Jakarta Sans Bold (ı stem centred
 * 0.114em from its origin; the font's own dot spans 0.605–0.745em, so 0.6em keeps the gap).
 */
function Wordmark({ tone, size }: { tone: LogoTone; size: LogoSize }) {
  return (
    <span
      aria-hidden
      className={cn(
        "font-bold tracking-[-0.03em] whitespace-nowrap",
        WORDMARK_SIZE[size],
        tone === "on-dark" ? "text-rail-foreground" : "text-foreground",
      )}
    >
      spanl
      <span
        className={cn(
          "-mr-[0.214em] ml-[0.014em] inline-block size-[0.2em] rounded-full align-[0.6em]",
          tone === "on-dark" ? "bg-lime" : "bg-current",
        )}
      />
      ıght
    </span>
  );
}

/**
 * The Spotlight mark: a lamp, its cone of light and the one span it lands on, lit lime.
 * `on-light` draws it at 72% on an ink tile (canvas, panels, favicon); `on-dark` draws it bare
 * for the ink rail. Decorative: pair it with visible text or a label.
 */
export function LogoMark({
  tone = "on-light",
  size = "md",
  className,
}: {
  tone?: LogoTone;
  size?: LogoSize;
  className?: string;
}) {
  const beamId = `logo-beam-${useId()}`;
  const tile = tone === "on-light";

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        MARK_SIZE[size],
        tile && "rounded-[24%] bg-rail",
        className,
      )}
    >
      <svg viewBox="0 0 32 32" fill="none" className={tile ? "size-[72%]" : "size-full"}>
        <defs>
          <linearGradient id={beamId} x1="16" y1="8" x2="16" y2="23" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--lime)" stopOpacity="0.85" />
            <stop offset="1" stopColor="var(--lime)" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <rect x="12.5" y="3.5" width="7" height="3.5" rx="1.75" fill="var(--lime)" />
        <path d="M13.5 8.5H18.5L23 23H9Z" fill={`url(#${beamId})`} />
        <rect
          x="3"
          y="23"
          width="26"
          height="5"
          rx="2.5"
          fill="var(--rail-foreground)"
          fillOpacity="0.3"
        />
        <rect x="9" y="23" width="14" height="5" rx="2.5" fill="var(--lime)" />
      </svg>
    </span>
  );
}
