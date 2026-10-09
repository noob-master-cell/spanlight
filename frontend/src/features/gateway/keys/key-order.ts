import type { GatewayKey } from "@/lib/api";

/** Keys in use first, revoked keys last. The API already sends each group newest first. */
export function sortKeys(keys: readonly GatewayKey[]): GatewayKey[] {
  const live = keys.filter((key) => key.revoked_at === null);
  const revoked = keys.filter((key) => key.revoked_at !== null);
  return [...live, ...revoked];
}
