import { useMemo } from "react";

import { Button } from "@/components/ui/button";

import { AuditDateFilter } from "./audit-date-filter";
import { actionOptions, actorOptions, withSelected } from "./audit-filter-options";
import { FilterSelectPill } from "./audit-filter-pill";
import type { AuditFilterValues } from "./audit-filters";
import { useMembersQuery } from "./member-queries";

interface AuditFilterBarProps {
  values: AuditFilterValues;
  onChange: (patch: AuditFilterValues) => void;
  /** Shows "Clear filters" at the end of the bar; the empty state has its own button instead. */
  showClear: boolean;
  onClear: () => void;
}

/**
 * Action, Actor and Date pills with "Clear filters" (Figma "Settings/Filter pill" row). The
 * choices live in the URL, so the list and the CSV download read the same ones.
 */
export function AuditFilterBar({ values, onChange, showClear, onClear }: AuditFilterBarProps) {
  const membersQuery = useMembersQuery();
  const members = membersQuery.data;

  const actions = useMemo(
    () => withSelected(actionOptions(), values.action, values.action ?? ""),
    [values.action],
  );
  const actors = useMemo(
    () => withSelected(actorOptions(members ?? []), values.actor, "Former member"),
    [members, values.actor],
  );

  return (
    <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-2 py-1">
      <FilterSelectPill
        label="Action"
        allLabel="All actions"
        value={values.action}
        options={actions}
        onChange={(action) => {
          onChange({ action });
        }}
      />
      <FilterSelectPill
        label="Actor"
        allLabel="All members"
        value={values.actor}
        options={actors}
        onChange={(actor) => {
          onChange({ actor });
        }}
      />
      <AuditDateFilter
        since={values.since}
        until={values.until}
        onApply={(range) => {
          onChange(range);
        }}
      />
      {showClear ? (
        <Button variant="ghost" className="ml-auto" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
