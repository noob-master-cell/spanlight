import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useProjectParams } from "@/features/shell/project-context";
import { errorMessage, orgsApi, queryKeys, type Role } from "@/lib/api";

import { memberErrorMessage } from "./member-utils";

export function useMembersQuery() {
  const { orgId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.org(orgId).members,
    queryFn: () => orgsApi.members(orgId),
  });
}

/** Pending invites are only visible to people who can manage members. */
export function useInvitesQuery(enabled: boolean) {
  const { orgId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.org(orgId).invites,
    queryFn: () => orgsApi.invites(orgId),
    enabled,
  });
}

export function useUpdateMemberRole() {
  const { orgId } = useProjectParams();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      orgsApi.updateMemberRole(orgId, userId, role),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).members });
    },
    onError: (error) => {
      toast.error(memberErrorMessage(error));
    },
  });
}

export function useRemoveMember() {
  const { orgId } = useProjectParams();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => orgsApi.removeMember(orgId, userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).members });
    },
    onError: (error) => {
      toast.error(memberErrorMessage(error));
    },
  });
}

/** The response carries the one-time invite URL; it is held in component state only. */
export function useCreateInvite() {
  const { orgId } = useProjectParams();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: Role) => orgsApi.createInvite(orgId, role),
    gcTime: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).invites });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}

export function useRevokeInvite() {
  const { orgId } = useProjectParams();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => orgsApi.revokeInvite(orgId, inviteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).invites });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}
