import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PagerDutySeverity } from "@/lib/api";

import { SEVERITIES, SEVERITY_LABELS } from "./channel-schema";

interface SeveritySelectProps {
  value: PagerDutySeverity;
  onChange: (value: PagerDutySeverity) => void;
  /** Wired by `FormField` onto the trigger. */
  id?: string;
  "aria-describedby"?: string;
}

/** The PagerDuty channel's severity (Figma "PagerDuty" dialog). */
export function SeveritySelect({
  value,
  onChange,
  id,
  "aria-describedby": describedBy,
}: SeveritySelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const severity = SEVERITIES.find((candidate) => candidate === next);
        if (severity) {
          onChange(severity);
        }
      }}
    >
      <SelectTrigger id={id} aria-describedby={describedBy}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SEVERITIES.map((severity) => (
          <SelectItem key={severity} value={severity}>
            {SEVERITY_LABELS[severity]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
