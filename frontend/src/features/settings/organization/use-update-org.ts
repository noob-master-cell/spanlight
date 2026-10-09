import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orgsApi, queryKeys, type Me, type OrgUpdate } from "@/lib/api";

import { withUpdatedOrg } from "./organization-flow";

/**
 * PATCH the organization (its name, or `require_2fa`) and put the saved version into the cached
 * `/me`, which is where every screen reads the organization from.
 */
export function useUpdateOrg(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: OrgUpdate) => orgsApi.update(orgId, update),
    onSuccess: (org) => {
      queryClient.setQueryData<Me | null>(queryKeys.me, (me) =>
        me ? withUpdatedOrg(me, org) : me,
      );
    },
  });
}
