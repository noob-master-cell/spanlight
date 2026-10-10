import { Badge } from "@/components/ui/badge";

import { insightKindLabel } from "./insight-format";

interface KindChipProps {
  kind: string;
  /** The catalogue name from the API; the local catalogue names the kind when absent. */
  label?: string;
}

/** Figma "Doctor/Kind chip": the detector's name, e.g. "Retry storm". */
export function KindChip({ kind, label }: KindChipProps) {
  return (
    <Badge variant="outline" className="font-medium">
      {label ?? insightKindLabel(kind)}
    </Badge>
  );
}
