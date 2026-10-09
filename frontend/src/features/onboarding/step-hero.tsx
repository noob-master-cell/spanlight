import type { ReactNode, Ref } from "react";

export interface StepHeroCopy {
  /** The sans part of the headline, e.g. "Set up in three". */
  title: string;
  /** The violet serif-italic phrase that ends it, e.g. "steps.". */
  accent: string;
  description?: ReactNode;
}

interface StepHeroProps extends StepHeroCopy {
  id: string;
  /** Lets the page move focus to the headline when the step changes. */
  headingRef?: Ref<HTMLHeadingElement>;
}

/** The onboarding headline (Figma "Hero"): 44px display sans, serif accent, optional subline. */
export function StepHero({ id, title, accent, description, headingRef }: StepHeroProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <h1
        ref={headingRef}
        id={id}
        tabIndex={-1}
        className="text-[2rem] leading-[1.04] font-extrabold tracking-[-0.04em] [overflow-wrap:anywhere] text-foreground outline-none sm:text-display"
      >
        {title}{" "}
        <span className="ml-1 font-serif-accent text-[2.25rem] leading-none text-accent sm:ml-1.5 sm:text-serif">
          {accent}
        </span>
      </h1>
      {description ? (
        <p className="text-sm text-muted-foreground sm:text-lg">{description}</p>
      ) : null}
    </div>
  );
}
