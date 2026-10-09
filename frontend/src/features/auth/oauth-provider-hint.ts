import type { OAuthProvider } from "@/lib/api";

const STORAGE_KEY = "spanlight-oauth-provider";

/**
 * The OAuth callback redirects back with an error code and no provider name, so the sign-in screen
 * remembers, for this tab only, which button was pressed. It only picks a word in an error message
 * and holds nothing secret.
 */
export function rememberOAuthProvider(provider: OAuthProvider): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, provider);
  } catch {
    // No storage (private mode, blocked): the error message names both providers instead.
  }
}

export function recallOAuthProvider(): OAuthProvider | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return value === "github" || value === "google" ? value : null;
  } catch {
    return null;
  }
}
