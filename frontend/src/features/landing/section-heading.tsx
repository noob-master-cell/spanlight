import type { ReactNode } from "react";

interface SectionHeadingProps {
  id: string;
  /** Violet overline above the title, e.g. "Features". Rendered uppercase. */
  overline: string;
  title: ReactNode;
  description: string;
}

/** Centred overline, display title and lead paragraph (Figma "Section heading"). */
export function SectionHeading({ id, overline, title, description }: SectionHeadingProps) {
  return (
    <div className="mx-auto flex max-w-[820px] flex-col items-center gap-3.5 text-center md:gap-[18px]">
      <p className="text-overline text-accent uppercase">{overline}</p>
      <h2
        id={id}
        className="text-[32px] leading-[1.04] font-extrabold tracking-[-0.04em] text-foreground md:text-display"
      >
        {title}
      </h2>
      <p className="max-w-[340px] text-base leading-[1.55] text-muted-foreground md:max-w-[620px] md:text-lg">
        {description}
      </p>
    </div>
  );
}

/** The violet Instrument Serif phrase that ends a section title. */
export function TitleAccent({ children }: { children: ReactNode }) {
  return (
    <span className="font-serif-accent text-[38px] leading-none text-accent md:text-serif">
      {children}
    </span>
  );
}
