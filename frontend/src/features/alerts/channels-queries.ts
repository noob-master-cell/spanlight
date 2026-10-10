import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useProjectParams } from "@/features/shell";
import {
  alertsApi,
  newIdempotencyKey,
  orgsApi,
  queryKeys,
  type AlertChannelCreate,
} from "@/lib/api";
import { useUncachedAction } from "@/lib/use-uncached-action";

/** Rows per page of the delivery log. */
export const DELIVERY_PAGE_SIZE = 20;

/** The org's members, for the email recipient picker. Same cache entry as the Members page. */
export function useOrgMembersQuery() {
  const { orgId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.org(orgId).members,
    queryFn: () => orgsApi.members(orgId),
  });
}

/** Invalidates the channel list and, through the shared key prefix, every delivery log. */
function useInvalidateChannels() {
  const { orgId } = useProjectParams();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).alertChannels });
}

/**
 * The request can carry a Slack URL or routing key and a webhook's answer carries its signing
 * secret, so it runs through `useUncachedAction`: a mutation would keep both in its cache.
 */
export function useCreateChannel() {
  const { orgId } = useProjectParams();
  const invalidate = useInvalidateChannels();
  return useUncachedAction(async (input: AlertChannelCreate) => {
    const created = await alertsApi.createChannel(orgId, input);
    void invalidate();
    return created;
  });
}

/** Same as creating: an edit can carry a new secret. */
export function useUpdateChannel() {
  const { orgId } = useProjectParams();
  const invalidate = useInvalidateChannels();
  return useUncachedAction(
    async (channelId: string, update: Parameters<typeof alertsApi.updateChannel>[2]) => {
      const updated = await alertsApi.updateChannel(orgId, channelId, update);
      void invalidate();
      return updated;
    },
  );
}

/** A new webhook signing secret, returned once. */
export function useRotateSecret() {
  const { orgId } = useProjectParams();
  const invalidate = useInvalidateChannels();
  return useUncachedAction(async (channelId: string) => {
    const rotated = await alertsApi.updateChannel(orgId, channelId, { rotate_secret: true });
    void invalidate();
    return rotated;
  });
}

export function useDeleteChannel() {
  const { orgId } = useProjectParams();
  const invalidate = useInvalidateChannels();
  return useMutation({
    mutationFn: (channelId: string) => alertsApi.deleteChannel(orgId, channelId),
    onSuccess: invalidate,
  });
}

/**
 * Sends a test now. Each click gets its own idempotency key, so a click that never got its answer
 * is not sent twice by the client's retry. A sent test marks the channel verified.
 */
export function useTestChannel(channelId: string) {
  const { orgId } = useProjectParams();
  const invalidate = useInvalidateChannels();
  return useMutation({
    mutationFn: () => alertsApi.testChannel(orgId, channelId, newIdempotencyKey()),
    onSettled: invalidate,
  });
}

/** One page of a channel's delivery log; `cursor` null is the newest page. */
export function useDeliveriesQuery(channelId: string, cursor: string | null) {
  const { orgId } = useProjectParams();
  return useQuery({
    queryKey: [...queryKeys.org(orgId).deliveries(channelId), cursor ?? "first"],
    queryFn: () => alertsApi.deliveries(orgId, channelId, { limit: DELIVERY_PAGE_SIZE, cursor }),
    placeholderData: keepPreviousData,
  });
}

/** Queues a failed delivery again; the log refreshes to show it pending. */
export function useRetryDelivery(channelId: string) {
  const { orgId } = useProjectParams();
  const invalidate = useInvalidateChannels();
  return useMutation({
    mutationFn: (deliveryId: string) => alertsApi.retryDelivery(orgId, channelId, deliveryId),
    onSettled: invalidate,
  });
}
