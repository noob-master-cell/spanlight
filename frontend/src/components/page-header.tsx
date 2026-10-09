import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  /**
   * An emphasised word or phrase rendered after the title in violet Instrument Serif italic,
   * e.g. title="Your models are" accent="behaving." Use at most one per page.
   */
  accent?: ReactNode;
  /** Small uppercase line above the title, e.g. "Thursday, 8 October · production". */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Buttons aligned to the bottom-right of the title on wide screens. */
  actions?: ReactNode;
  /** `default` 30px title (Heading/H1); `hero` 44px display title (32px on phones). */
  size?: "default" | "hero";
  className?: string;
}

/** The page title block: eyebrow, title with optional serif accent, description, actions. */
export function PageHeader({
  title,
  accent,
  eyebrow,
  description,
  actions,
  size = "default",
  className,
}: PageHeaderProps) {
  const hero = size === "hero";
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow ? (
          <p className="text-overline text-muted-foreground uppercase">{eyebrow}</p>
        ) : null}
        <h1
          className={cn(
            "[overflow-wrap:anywhere] text-foreground",
            hero
              ? "text-[2rem] leading-[1.04] font-extrabold tracking-[-0.04em] sm:text-display"
              : "text-h1",
          )}
        >
          {title}
          {accent ? (
            <>
              {" "}
              <span
                className={cn(
                  "font-serif-accent text-accent",
                  hero
                    ? "text-[2.25rem] leading-none sm:text-serif"
                    : "text-[2.125rem] leading-none",
                )}
              >
                {accent}
              </span>
            </>
          ) : null}
        </h1>
        {description ? (
          <p className={cn("text-muted-foreground", hero ? "text-lg" : "text-sm")}>{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
