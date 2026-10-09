import type { UseQueryResult } from "@tanstack/react-query";

import type { ChartPoint } from "./chart-data";
import type { Loadable } from "./spend-card";

/** Turns a query into what the Spend card renders: data, a loading state or a retry. */
export function loadable<T, R>(query: UseQueryResult<T>, select: (data: T) => R): Loadable<R> {
  if (query.isPending) {
    return { status: "pending" };
  }
  if (query.isError) {
    return {
      status: "error",
      retry: () => {
        void query.refetch();
      },
    };
  }
  return { status: "success", data: select(query.data) };
}

/** The KPI cards' sparkline input: the points, null while loading, "error" when it failed. */
export function sparklinePoints(points: Loadable<ChartPoint[]>): ChartPoint[] | null | "error" {
  switch (points.status) {
    case "success":
      return points.data;
    case "pending":
      return null;
    case "error":
      return "error";
  }
}
