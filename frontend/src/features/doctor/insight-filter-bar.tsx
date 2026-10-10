import { INSIGHT_KINDS, insightKindLabel, SEVERITIES, SEVERITY_LABELS } from "./insight-format";
import { FilterSelect } from "./filter-select";
import type { DoctorFilters } from "./insight-filters";

const SEVERITY_OPTIONS = SEVERITIES.map((severity) => ({
  value: severity,
  label: SEVERITY_LABELS[severity],
}));

const KIND_OPTIONS = INSIGHT_KINDS.map((kind) => ({ value: kind, label: insightKindLabel(kind) }));

interface InsightFilterBarProps {
  filters: DoctorFilters;
  onChange: (patch: Partial<Pick<DoctorFilters, "severity" | "kind">>) => void;
}

/** The severity and kind filters; both live in the URL. */
export function InsightFilterBar({ filters, onChange }: InsightFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect
        label="Severity"
        value={filters.severity}
        options={SEVERITY_OPTIONS}
        onChange={(severity) => {
          onChange({ severity });
        }}
      />
      <FilterSelect
        label="Kind"
        value={filters.kind}
        options={KIND_OPTIONS}
        onChange={(kind) => {
          onChange({ kind });
        }}
      />
    </div>
  );
}
