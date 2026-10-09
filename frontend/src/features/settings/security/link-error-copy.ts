import { isOAuthErrorCode, oauthErrorMessage } from "@/features/auth";
import type { OAuthProvider } from "@/lib/api";

import { PROVIDER_LABELS } from "./sign-in-methods";

export interface LinkErrorCopy {
  title: string;
  message: string;
}

/**
 * The callout for `?error=<CODE>` after connecting a provider failed (the callback redirects back
 * with the code). Unlike signing in, every code reads as itself here, including
 * `OAUTH_ALREADY_LINKED`; a code this app doesn't know reads as the provider not finishing. The
 * redirect names no provider, so it is the one the person last chose in this tab, or both.
 */
export function linkErrorCopy(
  code: string | undefined,
  provider: OAuthProvider | null,
): LinkErrorCopy | null {
  if (code === undefined) {
    return null;
  }
  const known = isOAuthErrorCode(code) ? code : "OAUTH_PROVIDER_ERROR";
  return {
    title: `Couldn't connect ${provider ? PROVIDER_LABELS[provider] : "GitHub or Google"}`,
    message: oauthErrorMessage(known, provider),
  };
}
