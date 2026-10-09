import { isApiError } from "@/lib/api";

/**
 * Whether the server turned a verification link down for good: unknown, used or expired (`404`, the
 * same answer for every bad token), or unreadable. Trying the same token again cannot help. Anything
 * else (no connection, a server error, a throttle) says nothing about the link, so it can be retried.
 */
export function isDeadLinkError(error: unknown): boolean {
  return isApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429;
}
