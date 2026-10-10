import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/page-header";

import { AlertsHeaderTabs } from "./alerts-header-tabs";

/** Spec copy for every disabled alerts control a member or viewer sees. */
export const ALERTS_READ_ONLY_REASON = "Only admins and owners can change alerts";

/**
 * The frame the Rules and Channels tabs render inside (Figma "Alerts/Page header" and
 * "Alerts/Sub-nav"): the shared title and description, then the tabs, then the tab's card. The
 * tab's primary action sits in its card header, not here.
 */
export function AlertsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alerts"
        description="Rules watch your metrics and tell you when something is wrong. Channels decide who hears about it."
      />
      <AlertsHeaderTabs />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Figma read-only line: a lock and "Only admins and owners can change alerts", visible text. */
export function AlertsReadOnlyLine() {
  return (
    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <Lock aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
      {ALERTS_READ_ONLY_REASON}
    </p>
  );
}
