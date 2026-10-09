import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";

import { ApproxValue } from "@/components/approx-value";
import { UnknownValue } from "@/components/unknown-value";
import { useProjectParams } from "@/features/shell/project-context";
import type { ModelMetrics } from "@/lib/api";
import { formatCost, formatDuration } from "@/lib/format";

import { isUnpriced } from "./models";

const NO_CALLS = "No LLM calls in this period";
const NO_PRICE = "No price for this model";

/** A p50 or p95 in milliseconds; "≈" when the window reads hourly rollups. */
export function ModelLatency({
  value,
  approximate,
}: {
  value: number | null;
  approximate: boolean;
}) {
  return (
    <ApproxValue value={formatDuration(value)} approximate={approximate} unknownReason={NO_CALLS} />
  );
}

export function ModelCost({ model }: { model: ModelMetrics }) {
  if (isUnpriced(model)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-subtle-foreground">
        <Info aria-hidden className="size-3.5" />
        <UnknownValue reason={NO_PRICE} />
      </span>
    );
  }
  return <>{formatCost(model.cost_usd)}</>;
}

export function ModelName({ model }: { model: string | null }) {
  const { orgId, projectId } = useProjectParams();
  if (model === null) {
    return <span className="text-sm text-muted-foreground italic">Unknown model</span>;
  }
  return (
    <Link
      to="/$orgId/$projectId/traces"
      params={{ orgId, projectId }}
      search={{ model }}
      title={`View traces using ${model}`}
      className="rounded-sm font-mono text-label text-foreground hover:text-accent hover:underline hover:underline-offset-4"
    >
      {model}
    </Link>
  );
}
