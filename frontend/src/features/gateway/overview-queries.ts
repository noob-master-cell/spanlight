import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useProjectFilters, useProjectParams } from "@/features/shell";
import { gatewayApi, queryKeys, type MetricsQuery } from "@/lib/api";

import { gatewayWindow } from "./overview-format";

/**
 * The gateway overview for the URL's time window (read as 7 days when the page doesn't offer it)
 * and environment. The URL range is never rewritten: other pages keep their 30 d or custom range.
 * `keepPreviousData` holds the last render while a new window loads. Pass `enabled: false` to
 * skip the request, e.g. while the project has no gateway keys.
 */
export function useGatewayOverviewQuery(enabled: boolean) {
  const { projectId } = useProjectParams();
  const { range, environment } = useProjectFilters();
  const window = gatewayWindow(range);
  const query: MetricsQuery = { from: window.from, to: window.to, environment };

  const overview = useQuery({
    queryKey: queryKeys.project(projectId).gateway.overview(query),
    queryFn: () => gatewayApi.overview(projectId, query),
    placeholderData: keepPreviousData,
    enabled,
  });

  return { overview, window };
}
