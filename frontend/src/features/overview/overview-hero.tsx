import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { useProjectParams } from "@/features/shell/project-context";

import type { HeroStatus } from "./hero";

interface OverviewHeroProps {
  /**
   * The date line: `full` on wider screens ("Thursday, 8 October · production · Last 24 hours"),
   * `compact` on phones, where the filters sit right above the page ("… · Last 24h").
   */
  eyebrow: { full: string; compact: string };
  /** "Good afternoon, Dheeraj." */
  greeting: string;
  /** The status sentence, or null while it is unknown (loading) or unavailable (error). */
  status: HeroStatus | null;
  isLoading: boolean;
  /** Shows the "Listening for traces" pill instead of the actions (first run). */
  listeningEnvironment?: string | null;
}

/**
 * The page title (Figma "Hero"): date and filters, a greeting by time of day and one sentence
 * on how the window looks, with the serif accent on its last words.
 */
export function OverviewHero({
  eyebrow,
  greeting,
  status,
  isLoading,
  listeningEnvironment,
}: OverviewHeroProps) {
  const firstRun = status?.kind === "first-run";

  return (
    <PageHeader
      size="hero"
      eyebrow={
        <span className="mb-1.5 flex items-center gap-2">
          {firstRun ? null : (
            <StatusDot
              state="live"
              pulse={false}
              className="ring-[1.5px] ring-foreground ring-inset max-sm:hidden"
            />
          )}
          <span className="sm:hidden">{eyebrow.compact}</span>
          <span className="max-sm:hidden">{eyebrow.full}</span>
        </span>
      }
      title={
        <>
          <span className="mb-1 block text-lg font-normal tracking-normal text-muted-foreground sm:mb-0.5 sm:text-display sm:font-extrabold sm:tracking-[-0.04em]">
            {greeting}
          </span>
          {status ? status.lead : null}
          {isLoading ? (
            // A span, not <Skeleton> (a div): headings may only contain phrasing content.
            <span
              aria-hidden
              className="inline-block h-9 w-72 max-w-full animate-shimmer rounded-md bg-surface-muted bg-linear-to-r from-surface-muted via-surface-hover to-surface-muted bg-size-[200%_100%] align-middle sm:h-11 sm:w-[28rem]"
            />
          ) : null}
        </>
      }
      accent={status?.accent}
      actions={
        firstRun ? (
          <ListeningPill environment={listeningEnvironment ?? null} />
        ) : (
          <ExploreTracesButton />
        )
      }
    />
  );
}

function ExploreTracesButton() {
  const { orgId, projectId } = useProjectParams();
  return (
    <Button asChild variant="primary" size="lg" className="w-full sm:w-auto">
      {/* The project route keeps the range and environment in the URL, so the traces page opens
          on the same window. */}
      <Link to="/$orgId/$projectId/traces" params={{ orgId, projectId }}>
        Explore traces
        <ArrowUpRight aria-hidden className="size-3.5!" />
      </Link>
    </Button>
  );
}

function ListeningPill({ environment }: { environment: string | null }) {
  return (
    <p
      role="status"
      className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface py-2.5 pr-4 pl-3.5 text-sm font-medium text-foreground shadow-card"
    >
      <StatusDot state="live" className="ring-[1.5px] ring-foreground ring-inset" />
      {environment ? `Listening for traces on ${environment}` : "Listening for new traces"}
    </p>
  );
}
