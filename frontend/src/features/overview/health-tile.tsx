import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { ErrorState } from "@/components/error-state";
import { UnknownValue } from "@/components/unknown-value";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useProjectParams } from "@/features/shell/project-context";
import type { Health } from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  APPROXIMATE_LINE,
  BAND_LABELS,
  FORMULA_LINE,
  NO_SCORE_REASON,
  healthBand,
  penaltyRows,
  ringFraction,
  summaryLine,
  type HealthBand,
} from "./health-format";

interface HealthTileProps {
  health: Health;
  /** Lower-case window label for the summary line, e.g. "last 24h". */
  rangeLabel: string;
  className?: string;
}

const BAND_TEXT: Record<HealthBand, string> = {
  good: "text-success",
  fair: "text-warning",
  poor: "text-danger",
  none: "text-subtle-foreground",
};

const BAND_BADGE = {
  good: "success",
  fair: "warning",
  poor: "danger",
  none: "neutral",
} as const satisfies Record<HealthBand, "success" | "warning" | "danger" | "neutral">;

const CARD_CLASSES = "flex items-center gap-5 p-5 sm:px-6";

/**
 * Figma "Overview/Health tile": the Doctor's 0 to 100 score as a ring, its band, a one-line
 * summary of open findings and a link to the Doctor. The score is "—" when the window has no
 * LLM calls; the ring's tooltip lists each penalty that took points off.
 */
export function HealthTile({ health, rangeLabel, className }: HealthTileProps) {
  const { orgId, projectId } = useProjectParams();
  const band = healthBand(health.value);

  return (
    <Card className={cn(CARD_CLASSES, className)}>
      <ScoreRing health={health} band={band} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-card">Health</h2>
          <Badge variant={BAND_BADGE[band]} size="sm">
            {BAND_LABELS[band]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{summaryLine(health, rangeLabel)}</p>
        <Link
          to="/$orgId/$projectId/doctor"
          params={{ orgId, projectId }}
          className="inline-flex min-h-6 w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-accent hover:underline"
        >
          Open the Doctor
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    </Card>
  );
}

function ScoreRing({ health, band }: { health: Health; band: HealthBand }) {
  const { value } = health;
  const ring = (
    <span className="relative block size-22 shrink-0">
      <svg viewBox="0 0 88 88" aria-hidden className="size-full -rotate-90">
        <circle
          cx="44"
          cy="44"
          r="38"
          fill="none"
          strokeWidth="8"
          className="stroke-surface-muted"
        />
        {value === null ? null : (
          <circle
            cx="44"
            cy="44"
            r="38"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${ringFraction(value) * 100} 100`}
            className={cn("stroke-current", BAND_TEXT[band])}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {value === null ? (
          <span className="text-metric-xl text-foreground">
            <UnknownValue reason={NO_SCORE_REASON} />
          </span>
        ) : (
          <>
            <span className="text-h1 text-foreground tabular">{value}</span>
            <span className="mt-0.5 text-xs text-muted-foreground">/100</span>
          </>
        )}
      </span>
    </span>
  );
  if (value === null) {
    return ring;
  }
  return <PenaltyTooltip health={health}>{ring}</PenaltyTooltip>;
}

/** The score's breakdown: only the penalties that took points off, then the formula. */
function PenaltyTooltip({ health, children }: { health: Health; children: ReactNode }) {
  const rows = penaltyRows(health.components);
  return (
    <Tooltip
      side="bottom"
      content={
        <div className="flex w-56 flex-col gap-2">
          {rows.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {rows.map((row) => (
                <li key={row.name} className="flex items-center justify-between gap-3">
                  <span>{row.label}</span>
                  <span className="tabular">
                    {row.penalty}
                    {row.detail ? <span className="sr-only"> ({row.detail})</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="border-t border-rail-tile-hover pt-2 font-normal text-rail-muted-foreground">
            {FORMULA_LINE}
            {health.approximate ? `. ${APPROXIMATE_LINE}` : null}
          </p>
        </div>
      }
    >
      <button
        type="button"
        aria-label={`Health score ${health.approximate ? "about " : ""}${health.value ?? ""} out of 100. How it is calculated`}
        className="flex shrink-0 cursor-help rounded-full"
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function HealthTileSkeleton({ className }: { className?: string }) {
  return (
    <Card aria-hidden className={cn(CARD_CLASSES, className)}>
      <Skeleton className="size-22 shrink-0 rounded-full" />
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-56 max-w-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    </Card>
  );
}

export function HealthTileError({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <Card className={className}>
      <ErrorState compact error={error} title="Couldn't load health" onRetry={onRetry} />
    </Card>
  );
}
