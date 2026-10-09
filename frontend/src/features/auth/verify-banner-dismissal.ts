const STORAGE_KEY = "spanlight-verify-banner-dismissed";

/**
 * "×" on the verify banner hides it for the rest of this browser session, for that user. Signing
 * out forgets it, so the banner is back after the next sign-in until the email is verified.
 */
export function isBannerDismissed(userId: string): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === userId;
  } catch {
    return false;
  }
}

export function dismissBanner(userId: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, userId);
  } catch {
    // No storage: the banner comes back on the next page load, which is harmless.
  }
}

export function clearBannerDismissal(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was stored.
  }
}
