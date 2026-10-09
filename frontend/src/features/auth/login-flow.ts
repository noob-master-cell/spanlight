import type { LoginOut, OAuthProvider } from "@/lib/api";

import { safeNextPath } from "./search";

/** The second step of signing in. The challenge never goes in this URL. */
export const TWO_FACTOR_PATH = "/login/two-factor";

export type LoginStep = { kind: "signed-in" } | { kind: "two-factor"; challenge: string };

/** Where a login answer leads: straight in, or on to the code step. */
export function nextLoginStep(result: LoginOut): LoginStep {
  if (result.status === "totp_required") {
    return { kind: "two-factor", challenge: result.challenge };
  }
  return { kind: "signed-in" };
}

/** Where to land once a person is signed in: `next` when it is a safe path on this site. */
export function postLoginDestination(next: string | undefined): string {
  return safeNextPath(next) ?? "/";
}

/** The codes the OAuth callback puts in `?error=` (`/login` for sign-in, Security for linking). */
export const OAUTH_ERROR_CODES = [
  "OAUTH_STATE",
  "OAUTH_PROVIDER_ERROR",
  "EMAIL_UNVERIFIED_AT_PROVIDER",
  "ACCOUNT_EMAIL_UNVERIFIED",
  "OAUTH_ALREADY_LINKED",
] as const;

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

export function isOAuthErrorCode(value: unknown): value is OAuthErrorCode {
  return OAUTH_ERROR_CODES.some((code) => code === value);
}

const PROVIDER_NAMES: Record<OAuthProvider, string> = { github: "GitHub", google: "Google" };

/**
 * The provider's name for an error message. The callback redirect names only the error, so this is
 * the provider the person last chose in this tab; without one, both are named.
 */
export function providerLabel(provider: OAuthProvider | null): string {
  return provider ? PROVIDER_NAMES[provider] : "GitHub or Google";
}

/** The sign-in and link error copy, verbatim from the approved copy table, per code. */
const OAUTH_ERROR_COPY: Record<OAuthErrorCode, (provider: string) => string> = {
  OAUTH_STATE: () => "Sign-in took too long or was started in another tab. Try again.",
  OAUTH_PROVIDER_ERROR: (provider) => `${provider} didn't complete the sign-in. Try again.`,
  EMAIL_UNVERIFIED_AT_PROVIDER: (provider) =>
    `Your ${provider} email isn't verified. Verify it with ${provider}, or sign in with your password.`,
  ACCOUNT_EMAIL_UNVERIFIED: (provider) =>
    `An account with this email already exists. Sign in with your password, then connect ${provider} in Settings › Security.`,
  OAUTH_ALREADY_LINKED: (provider) =>
    `That ${provider} account is already connected to another Spanlight user.`,
};

/** The message for any OAuth error code, for the screen that shows it. */
export function oauthErrorMessage(code: OAuthErrorCode, provider: OAuthProvider | null): string {
  return OAUTH_ERROR_COPY[code](providerLabel(provider));
}

/**
 * The banner on `/login?error=<code>`, or null when there is no error. `OAUTH_ALREADY_LINKED` only
 * happens when connecting a provider, so on this page it, and any code this app does not know, reads
 * as the provider not finishing the sign-in.
 */
export function signInErrorMessage(
  code: string | undefined,
  provider: OAuthProvider | null,
): string | null {
  if (code === undefined) {
    return null;
  }
  const known = isOAuthErrorCode(code) && code !== "OAUTH_ALREADY_LINKED" ? code : null;
  return oauthErrorMessage(known ?? "OAUTH_PROVIDER_ERROR", provider);
}
