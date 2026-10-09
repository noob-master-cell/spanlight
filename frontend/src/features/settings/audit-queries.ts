import { useInfiniteQuery } from "@tanstack/react-query";

import { useProjectParams } from "@/features/shell";
import { orgsApi, queryKeys, type AuditFilters } from "@/lib/api";

const AUDIT_PAGE_SIZE = 50;

/** The audit log, newest first, narrowed by `filters`; each distinct filter set is its own list. */
export function useAuditLogQuery(filters: AuditFilters) {
  const { orgId } = useProjectParams();
  return useInfiniteQuery({
    queryKey: queryKeys.org(orgId).auditEvents(filters),
    queryFn: ({ pageParam }) =>
      orgsApi.audit(orgId, { ...filters, cursor: pageParam, limit: AUDIT_PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });
}
