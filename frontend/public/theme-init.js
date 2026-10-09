/*
 * Applies the saved colour theme before the app renders, so a dark-theme user never sees a
 * light flash. Loaded as a plain blocking <script src> from index.html: the production
 * Content-Security-Policy (default-src 'self') blocks inline scripts.
 *
 * Keep in sync with src/lib/theme.ts (storage key, default "light").
 */
(function () {
  try {
    var stored = window.localStorage.getItem("spanlight-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = stored === "dark" || (stored === "system" && prefersDark);
    document.documentElement.classList.toggle("dark", dark);
  } catch (error) {
    // Storage or matchMedia unavailable: stay on the light default.
  }
})();
