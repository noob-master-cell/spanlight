import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useNow } from "@/lib/use-now";

import { useLastDetectorRun } from "./doctor-queries";
import { lastCheckedText } from "./insight-format";

/** Figma "Last checked 4 min ago" pill beside the page header. */
export function LastCheckedPill() {
  const run = useLastDetectorRun();
  const now = useNow();
  const text = lastCheckedText(
    {
      pending: run.isPending,
      failed: run.isError && run.data === undefined,
      runFailed: (run.data?.error ?? null) !== null,
      ranAt: run.data?.ran_at ?? null,
    },
    now,
  );
  return (
    <Badge variant="outline" className="h-9 gap-2 px-3.5 text-label font-medium">
      <Clock aria-hidden strokeWidth={2} />
      {text}
    </Badge>
  );
}
