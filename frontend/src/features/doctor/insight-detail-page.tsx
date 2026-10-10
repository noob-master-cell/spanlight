import { getRouteApi } from "@tanstack/react-router";

import { usePermission } from "@/features/shell";
import type { InsightDetail } from "@/lib/api";
import { useNow } from "@/lib/use-now";

import { useInsightQuery } from "./doctor-queries";
import { EvidenceCard } from "./evidence-card";
import { ExplainSection } from "./explain-section";
import { FixAndVerification } from "./fix-and-verification";
import { InsightDetailSkeleton, InsightLoadError } from "./insight-detail-states";
import { InsightHeader } from "./insight-header";
import { CertaintyCard, LayerCard } from "./layer-and-certainty";

const insightRoute = getRouteApi("/_authed/$orgId/$projectId/doctor/$insightId");

/**
 * Figma "Doctor — Insight detail": header and summary, the fix and how to verify it, the
 * evidence, where it fails, how certain the finding is, then the Explain card.
 */
export function InsightDetailPage() {
  const { insightId } = insightRoute.useParams();
  const query = useInsightQuery(insightId);

  if (query.isPending) {
    return <InsightDetailSkeleton />;
  }
  // A failed background refresh keeps the loaded insight on screen; polling goes on.
  if (query.data === undefined) {
    return (
      <InsightLoadError
        error={query.error}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  return <LoadedInsight insight={query.data} />;
}

function LoadedInsight({ insight }: { insight: InsightDetail }) {
  const canManage = usePermission("insights:manage");
  const now = useNow();
  return (
    <div className="flex flex-col gap-6">
      <InsightHeader insight={insight} canManage={canManage} now={now} />
      <FixAndVerification fix={insight.suggested_fix} verification={insight.verification} />
      <EvidenceCard evidence={insight.evidence} />
      <div className="grid gap-5 md:grid-cols-2">
        <LayerCard layer={insight.failure_layer} />
        <CertaintyCard certainty={insight.certainty} />
      </div>
      <ExplainSection
        insightId={insight.id}
        explanations={insight.explanations}
        canManage={canManage}
      />
    </div>
  );
}
