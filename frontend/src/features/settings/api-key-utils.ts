import type { ApiKey } from "@/lib/api";

const KEY_PREFIX = "spl_live_";

/**
 * The visible part of a key, e.g. "spl_live_ABCD…". The API returns the lookup
 * prefix; it may or may not already include the "spl_live_" scheme.
 */
export function formatKeyPrefix(prefix: string): string {
  const withScheme = prefix.startsWith(KEY_PREFIX) ? prefix : `${KEY_PREFIX}${prefix}`;
  return `${withScheme}…`;
}

export function isRevoked(key: ApiKey): boolean {
  return key.revoked_at !== null;
}

function newestFirst(a: string, b: string): number {
  return new Date(b).getTime() - new Date(a).getTime();
}

/** Active keys first (newest first), then revoked keys (most recently revoked first). */
export function sortApiKeys(keys: readonly ApiKey[]): ApiKey[] {
  const active = keys.filter((key) => !isRevoked(key));
  const revoked = keys.filter(isRevoked);
  active.sort((a, b) => newestFirst(a.created_at, b.created_at));
  revoked.sort((a, b) => newestFirst(a.revoked_at ?? a.created_at, b.revoked_at ?? b.created_at));
  return [...active, ...revoked];
}

export interface RevokeAbility {
  canRevokeAny: boolean;
  canRevokeOwn: boolean;
  userId: string;
}

export type RevokeDecision = { allowed: true } | { allowed: false; reason: string };

/** Mirrors the server rule: `key:revoke_any`, or `key:revoke_own` for keys you created. */
export function revokeDecision(key: ApiKey, ability: RevokeAbility): RevokeDecision {
  if (ability.canRevokeAny) {
    return { allowed: true };
  }
  if (ability.canRevokeOwn) {
    if (key.created_by?.id === ability.userId) {
      return { allowed: true };
    }
    return { allowed: false, reason: "You can only revoke keys you created." };
  }
  return { allowed: false, reason: "Viewers can't revoke API keys." };
}

/** The line a developer pastes into their environment. */
export function envLine(secret: string): string {
  return `SPANLIGHT_API_KEY=${secret}`;
}
