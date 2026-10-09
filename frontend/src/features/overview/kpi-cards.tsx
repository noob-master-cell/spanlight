import { DeltaPill } from "@/components/delta-pill";
import { UnknownValue } from "@/components/unknown-value";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OverviewMetrics } from "@/lib/api";
import { cn } from "@/lib/utils";

import type { ChartPoint } from "./chart-data";
import {
  buildKpiCards,
  formatDeltaMagnitude,
  kpiTrend,
  type KpiCardModel,
  type KpiDelta,
  type KpiId,
} from "./kpis";
import { EmptySparkline, Sparkline, type SparklineTone } from "./sparkline";

const SPARKLINE_TONES: Record<KpiId, SparklineTone> = {
  p95: "latency",
  error_rate: "errors",
  llm_calls: "calls",
  tokens: "on-accent",
};

/** The Tokens card is the page's one accent (violet → fuchsia) card. */
const ACCENT_KPI: KpiId = "tokens";

const CARD_LAYOUT = "flex h-full min-h-[132px] gap-3 py-5 pr-5 pl-6";

interface KpiCardsProps {
  metrics: OverviewMetrics;
  /** Timeseries behind the sparklines: null while loading, "error" when it failed. */
  points: ChartPoint[] | null | "error";
  /** e.g. "vs previous 24h". */
  comparisonLabel: string;
  className?: string;
}

/** p95 latency, error rate, LLM calls and tokens, each with a delta and a sparkline. */
export function KpiCards({ metrics, points, comparisonLabel, className }: KpiCardsProps) {
  const cards = buildKpiCards(metrics);
  return (
    <ul aria-label="Key metrics" className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {cards.map((card) => (
        <li key={card.id} className="min-w-0">
          <KpiCard card={card} points={points} comparisonLabel={comparisonLabel} />
        </li>
      ))}
    </ul>
  );
}

interface KpiCardProps {
  card: KpiCardModel;
  points: KpiCardsProps["points"];
  comparisonLabel: string;
}

function KpiCard({ card, points, comparisonLabel }: KpiCardProps) {
  const accent = card.id === ACCENT_KPI;

  return (
    <Card
      variant={accent ? "accent" : "default"}
      className={cn(
        CARD_LAYOUT,
        accent &&
          "shadow-[0_14px_32px_-14px_color-mix(in_srgb,var(--accent-card-from)_60%,transparent)]",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className={cn("text-sm font-medium", accent ? "" : "text-muted-foreground")}>
          {card.label}
        </p>
        <p className={cn("truncate text-metric", accent ? "" : "text-foreground")}>
          {card.value === null ? <UnknownValue reason={card.unknownReason} /> : card.value}
        </p>
        {card.detail ? (
          <p
            className={cn(
              "truncate text-xs font-medium tabular",
              accent ? "" : "text-subtle-foreground",
            )}
          >
            {card.detail}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-3">
        <KpiDeltaPill delta={card.delta} accent={accent} comparisonLabel={comparisonLabel} />
        <KpiSparkline id={card.id} points={points} />
      </div>
    </Card>
  );
}

function KpiSparkline({ id, points }: { id: KpiId; points: KpiCardsProps["points"] }) {
  if (points === null) {
    // The light shimmer would glare on the gradient card; use a soft translucent block there.
    return id === ACCENT_KPI ? (
      <span aria-hidden className="block h-8 w-24 rounded-md bg-accent-card-foreground/15" />
    ) : (
      <Skeleton className="h-8 w-24" />
    );
  }
  if (points === "error") {
    // The calls chart shows the error and the retry; keep the card's shape here.
    return <span aria-hidden className="block h-8 w-24" />;
  }
  return <Sparkline values={kpiTrend(id, points)} tone={SPARKLINE_TONES[id]} />;
}

interface KpiDeltaPillProps {
  delta: KpiDelta | null;
  accent: boolean;
  comparisonLabel: string;
}

function KpiDeltaPill({ delta, accent, comparisonLabel }: KpiDeltaPillProps) {
  if (!delta) {
    return null;
  }
  return (
    <DeltaPill
      delta={delta.value}
      increaseIsGood={delta.increaseIsGood}
      format={(absolute) => formatDeltaMagnitude(delta.unit, absolute)}
      surface={accent ? "accent" : "default"}
      comparisonLabel={comparisonLabel}
    />
  );
}

/** Loading placeholders shaped like the four KPI cards. */
export function KpiCardsSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className={CARD_LAYOUT}>
          <div className="flex flex-1 flex-col gap-2.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="flex flex-col items-end justify-between">
            <Skeleton className="h-6 w-14 rounded-full" />
            <Skeleton className="h-8 w-24" />
          </div>
        </Card>
      ))}
    </div>
  );
}

const EMPTY_KPI_LABELS = ["LLM calls", "p95 latency", "Error rate", "Spend"] as const;

/** First-run KPI cards: the metrics the page will show, with nothing to report yet. */
export function EmptyKpiCards() {
  return (
    <ul aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {EMPTY_KPI_LABELS.map((label) => (
        <li key={label} className="min-w-0">
          <Card className={CARD_LAYOUT}>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p aria-hidden className="text-metric text-subtle-foreground">
                —
              </p>
              <p className="text-xs font-medium text-subtle-foreground">No data yet</p>
            </div>
            <div className="flex shrink-0 flex-col justify-end">
              <EmptySparkline />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
