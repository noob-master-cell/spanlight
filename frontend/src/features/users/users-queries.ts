import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { useProjectFilters, useProjectParams } from "@/features/shell/project-context";
import { endUsersApi, queryKeys, type UserSort } from "@/lib/api";

import { toUserListQuery } from "./user-sort";

/** End users ranked by `sort` over the selected range. Previous rows stay while the sort changes. */
export function useUserListQuery(sort: UserSort) {
  const { projectId } = useProjectParams();
  const { range } = useProjectFilters();
  const query = toUserListQuery(sort, range);

  return useInfiniteQuery({
    queryKey: queryKeys.project(projectId).users(query),
    queryFn: ({ pageParam }) => endUsersApi.list(projectId, { ...query, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    placeholderData: keepPreviousData,
  });
}

/** One user's totals, daily rows and recent sessions over the selected range. */
export function useUserDetailQuery(userId: string) {
  const { projectId } = useProjectParams();
  const { range } = useProjectFilters();
  const query = { from: range.from, to: range.to };

  return useQuery({
    queryKey: queryKeys.project(projectId).user(userId, query),
    queryFn: () => endUsersApi.get(projectId, userId, query),
  });
}
