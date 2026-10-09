import { readFragmentParam } from "./fragment-token";

/**
 * The challenge a correct password (or an OAuth callback) leaves for the code step. It signs nobody
 * in by itself, but it is a credential for 5 minutes, so it lives only in this module's memory (or in
 * the fragment the OAuth redirect puts it in): never in the URL's query, storage, router state or the
 * query cache. A reload loses it, and the step then says the sign-in timed out.
 *
 * It is handed over once. The code step copies it into its own state and releases it at once, so an
 * abandoned sign-in cannot be resumed from here, and the sign-in screen releases it too. Whether it
 * has run out is the server's call (`401 TOTP_CHALLENGE_INVALID`), never this browser's clock.
 */
export interface PendingChallenge {
  token: string;
}

let held: PendingChallenge | null = null;

export function holdChallenge(challenge: PendingChallenge): void {
  held = challenge;
}

export function releaseChallenge(): void {
  held = null;
}

/** The fragment's challenge when the page was opened by the OAuth redirect, else the held one. */
export function resolveChallenge(hash: string = window.location.hash): PendingChallenge | null {
  const fromFragment = readFragmentParam("challenge", hash);
  if (fromFragment) {
    return { token: fromFragment };
  }
  return held;
}
