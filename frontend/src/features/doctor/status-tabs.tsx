import { SegmentedControl } from "@/components/ui/segmented-control";
import type { InsightStatus } from "@/lib/api";

import { STATUS_LABELS, STATUSES } from "./insight-format";

interface StatusTabsProps {
  value: InsightStatus;
  onChange: (status: InsightStatus) => void;
}

/**
 * Figma "Doctor/Status tabs": Open, Acknowledged, Muted and Resolved as one choice. The row
 * scrolls sideways on a phone so Resolved is always reachable.
 */
export function StatusTabs({ value, onChange }: StatusTabsProps) {
  return (
    <div className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
      <SegmentedControl
        aria-label="Insight status"
        value={value}
        onValueChange={onChange}
        options={STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }))}
      />
    </div>
  );
}
