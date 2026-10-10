import { Callout } from "@/components/callout";
import type { Insight } from "@/lib/api";

import { formatDateTime } from "./insight-format";

/**
 * The muted and resolved banners. A muted insight says until when and why; a resolved one says
 * it reopens on a new detection. Other statuses have none. Times are local, like the rest of
 * the app.
 */
export function StatusBanner({ insight }: { insight: Insight }) {
  if (insight.status === "muted") {
    const until = formatDateTime(insight.muted_until);
    return (
      <Callout tone="warning" title={until === null ? "Muted" : `Muted until ${until}`}>
        {insight.mute_reason === null ? null : <span>Reason: {insight.mute_reason} </span>}
        <span>Muted insights keep counting occurrences but never notify.</span>
      </Callout>
    );
  }
  if (insight.status === "resolved") {
    const at = formatDateTime(insight.resolved_at);
    return (
      <Callout tone="success" title={at === null ? "Resolved" : `Resolved ${at}`}>
        No recurrence for 24 hours. It reopens if the Doctor sees it again.
      </Callout>
    );
  }
  return null;
}
