import { getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";

import type { TraceFilters } from "./search";

const tracesRoute = getRouteApi("/_authed/$orgId/$projectId/traces");

/** The facet filters owned by the traces page. */
export const FACET_KEYS = ["status", "model", "release", "tag", "user", "session", "q"] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

/**
 * Every filter that shows up as a removable chip. `env` belongs to the shell (it also scopes the
 * overview and sessions), but it narrows this list too, so it gets a chip here.
 */
export const FILTER_KEYS = ["env", ...FACET_KEYS] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export const FILTER_LABELS: Record<FilterKey, string> = {
  env: "Environment",
  status: "Status",
  model: "Model",
  release: "Release",
  tag: "Tag",
  user: "User",
  session: "Session",
  q: "Search",
};

export type FilterPatch = Partial<Pick<TraceFilters, FilterKey>>;

export interface ActiveFilter {
  key: FilterKey;
  label: string;
  value: string;
}

const STATUS_LABELS: Record<NonNullable<TraceFilters["status"]>, string> = {
  ok: "OK",
  error: "Error",
};

export function activeFiltersOf(search: TraceFilters): ActiveFilter[] {
  const active: ActiveFilter[] = [];
  for (const key of FILTER_KEYS) {
    const raw = search[key];
    if (raw === undefined || raw === "") {
      continue;
    }
    const isStatus = key === "status" && (raw === "ok" || raw === "error");
    const value = isStatus ? STATUS_LABELS[raw] : raw;
    active.push({ key, label: FILTER_LABELS[key], value });
  }
  return active;
}

function clearedFilters(): Record<FilterKey, undefined> {
  return {
    env: undefined,
    status: undefined,
    model: undefined,
    release: undefined,
    tag: undefined,
    user: undefined,
    session: undefined,
    q: undefined,
  };
}

/** URL-synced filters for the traces list. */
export function useTraceFilters() {
  const search = tracesRoute.useSearch();
  const navigate = tracesRoute.useNavigate();

  /** Applies several filter changes in one navigation; blank values clear a filter. */
  const setFilters = useCallback(
    (patch: FilterPatch) => {
      const normalised: FilterPatch = { ...patch };
      for (const key of FILTER_KEYS) {
        const value = normalised[key];
        if (value !== undefined && value.trim() === "") {
          normalised[key] = undefined;
        }
      }
      void navigate({
        search: (prev) => ({ ...prev, ...normalised }),
        // Typing in the search box shouldn't flood the history stack.
        replace: Object.keys(patch).every((key) => key === "q"),
      });
    },
    [navigate],
  );

  const setFilter = useCallback(
    <K extends FilterKey>(key: K, value: TraceFilters[K]) => {
      const patch: FilterPatch = {};
      patch[key] = value;
      setFilters(patch);
    },
    [setFilters],
  );

  const clearFilters = useCallback(() => {
    void navigate({ search: (prev) => ({ ...prev, ...clearedFilters() }) });
  }, [navigate]);

  const activeFilters = activeFiltersOf(search);

  return {
    search,
    activeFilters,
    /** Any chip is showing, including the environment. */
    hasActiveFilters: activeFilters.length > 0,
    /** A facet narrows the list below the window totals (the environment doesn't). */
    hasFacetFilters: activeFilters.some((filter) => filter.key !== "env"),
    setFilter,
    setFilters,
    clearFilters,
  };
}
