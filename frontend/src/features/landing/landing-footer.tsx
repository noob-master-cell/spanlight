import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

import { EXTERNAL_LINKS, SECTION_IDS } from "./links";

const LINK_CLASS =
  "rounded-sm text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground";

interface LandingFooterProps {
  onTryDemo: () => void;
  demoPending: boolean;
}

/** Footer card with link columns and the oversized wordmark (Figma "Section/Footer"). */
export function LandingFooter({ onTryDemo, demoPending }: LandingFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="px-3 md:px-8">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 overflow-hidden rounded-t-card border-x border-t border-border bg-surface px-6 pt-9 md:px-14 md:pt-14">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col items-start gap-4 lg:w-[340px] lg:gap-[18px]">
            <Logo />
            <p className="text-sm text-muted-foreground">
              Open-source observability for LLM applications. Trace, measure and debug every model
              call.
            </p>
            <Button asChild>
              <a href={EXTERNAL_LINKS.github}>Star on GitHub</a>
            </Button>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-7">
            <FooterColumn heading="Product">
              <a href={`#${SECTION_IDS.features}`} className={LINK_CLASS}>
                Features
              </a>
              <a href={`#${SECTION_IDS.howItWorks}`} className={LINK_CLASS}>
                How it works
              </a>
              <button
                type="button"
                onClick={onTryDemo}
                disabled={demoPending}
                aria-busy={demoPending || undefined}
                className={`${LINK_CLASS} cursor-pointer text-left disabled:cursor-progress`}
              >
                Live demo
              </button>
              <Link to="/login" className={LINK_CLASS}>
                Sign in
              </Link>
            </FooterColumn>
            <FooterColumn heading="Developers">
              <a href={EXTERNAL_LINKS.docs} className={LINK_CLASS}>
                Documentation
              </a>
              <a href={EXTERNAL_LINKS.pythonSdk} className={LINK_CLASS}>
                Python SDK
              </a>
              <a href={EXTERNAL_LINKS.otlp} className={LINK_CLASS}>
                OpenTelemetry (OTLP)
              </a>
              <a href={EXTERNAL_LINKS.apiReference} className={LINK_CLASS}>
                API reference
              </a>
            </FooterColumn>
            <FooterColumn heading="Project">
              <a href={EXTERNAL_LINKS.github} className={LINK_CLASS}>
                GitHub
              </a>
              <a href={EXTERNAL_LINKS.license} className={LINK_CLASS}>
                MIT license
              </a>
              <a href={EXTERNAL_LINKS.selfHosting} className={LINK_CLASS}>
                Self-hosting guide
              </a>
              <a href={EXTERNAL_LINKS.security} className={LINK_CLASS}>
                Security
              </a>
            </FooterColumn>
          </nav>
        </div>

        <div className="h-px bg-border" />

        <div className="flex flex-col gap-1.5 text-xs leading-[1.4] font-medium text-subtle-foreground md:flex-row md:justify-between md:text-label md:leading-[1.4]">
          <p>© {year} Spanlight · MIT licensed</p>
          <p>Built with Python, Postgres and React</p>
        </div>

        {/*
         * Decorative wordmark, cropped by the card. Drawn as generated content so it isn't
         * read out or measured as body text (it is deliberately low-contrast).
         */}
        <div
          aria-hidden
          data-wordmark="spanlight"
          className="h-6 overflow-hidden text-[37px] leading-[1.04] font-extrabold tracking-[-0.04em] whitespace-nowrap text-surface-hover before:content-[attr(data-wordmark)] md:h-[83px] md:text-[129px]"
        />
      </div>
    </footer>
  );
}

function FooterColumn({ heading, children }: { heading: string; children: ReactNode[] }) {
  return (
    <div className="flex w-[140px] flex-col gap-3.5 xl:w-[180px]">
      <h2 className="text-sm font-semibold text-foreground">{heading}</h2>
      <ul className="flex flex-col items-start gap-3.5">
        {children.map((child, index) => (
          <li key={index}>{child}</li>
        ))}
      </ul>
    </div>
  );
}
