import { SegmentedControl } from "@/components/ui/segmented-control";
import type { AlertRuleKind } from "@/lib/api";

import { KIND_TAB_LABELS, RULE_EDITOR_COPY } from "./rule-form-options";

const KINDS: readonly AlertRuleKind[] = ["threshold", "anomaly"];

interface KindTabsProps {
  value: AlertRuleKind;
  onChange: (kind: AlertRuleKind) => void;
}

/**
 * Figma "Kind tabs": Threshold or Anomaly as a two-segment radio group on a muted track, with the
 * chosen kind explained underneath. Arrow keys move between the two.
 */
export function KindTabs({ value, onChange }: KindTabsProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label font-semibold text-foreground">Rule type</p>
      <SegmentedControl
        aria-label="Rule type"
        value={value}
        onValueChange={onChange}
        options={KINDS.map((kind) => ({ value: kind, label: KIND_TAB_LABELS[kind] }))}
        className="grid w-full grid-cols-2 border-0 bg-surface-muted shadow-none [&>*]:h-9"
      />
      <p className="text-xs font-medium text-muted-foreground">
        {RULE_EDITOR_COPY.kindHints[value]}
      </p>
    </div>
  );
}
