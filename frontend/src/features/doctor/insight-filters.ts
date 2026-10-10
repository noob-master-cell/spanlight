import type { InsightListQuery } from "@/lib/api";

import { INSIGHT_KINDS } from "./insight-format";
import type { DoctorSearch } from "./search";

/** How many insights one page of the list asks for. */
export const INSIGHT_PAGE_SIZE = 50;

/** The URL's filters: the status tab, and the optional severity and kind. */
export type DoctorFilters = Pick<DoctorSearch, "status" | "severity" | "kind">;

export type InsightQuery = Omit<InsightListQuery, "cursor">;

/** The URL's filters with a `kind` outside the catalogue dropped, so the picker never goes blank. */
export function normalizeFilters(filters: DoctorFilters): DoctorFilters {
  if (filters.kind === undefined || INSIGHT_KINDS.includes(filters.kind)) {
    return filters;
  }
  return { status: filters.status, severity: filters.severity };
}

/** The API query for a URL search. Absent filters are left out, not sent empty. */
export function searchToQuery(filters: DoctorFilters): InsightQuery {
  const query: InsightQuery = { status: [filters.status], limit: INSIGHT_PAGE_SIZE };
  if (filters.severity !== undefined) {
    query.severity = filters.severity;
  }
  if (filters.kind !== undefined && filters.kind !== "") {
    query.kind = filters.kind;
  }
  return query;
}

/** A severity or kind filter narrows the tab. */
export function hasActiveFilters(filters: DoctorFilters): boolean {
  return filters.severity !== undefined || (filters.kind !== undefined && filters.kind !== "");
}
