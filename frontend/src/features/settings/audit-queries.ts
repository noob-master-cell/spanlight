import { useInfiniteQuery } from "@tanstack/react-query";

import { useProjectParams } from "@/features/shell/project-context";
import { orgsApi, queryKeys } from "@/lib/api";

const AUDIT_PAGE_SIZE = 50;

export function useAuditLogQuery(enabled: boolean) {
  const { orgId } = useProjectParams();
  return useInfiniteQuery({
    queryKey: queryKeys.org(orgId).audit,
    queryFn: ({ pageParam }) => orgsApi.audit(orgId, pageParam, AUDIT_PAGE_SIZE),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    enabled,
  });
}
