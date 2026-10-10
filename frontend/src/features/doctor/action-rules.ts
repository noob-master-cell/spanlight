import type { InsightStatus } from "@/lib/api";

/** The reason a member or viewer sees beside the disabled actions. */
export const READ_ONLY_REASON = "Only admins and owners can change insights";

/** Which actions apply to each status (acknowledge: open; resolve: not resolved; unmute: muted). */
export function availableActions(status: InsightStatus) {
  return {
    acknowledge: status === "open",
    resolve: status !== "resolved",
    mute: true,
    unmute: status === "muted",
  };
}
