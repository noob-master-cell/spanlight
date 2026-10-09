import { z } from "zod";

/*
 * Zod probes for `new Function` support the first time it validates, and our Content-Security-Policy
 * (no 'unsafe-eval') reports that probe as a violation on every page load. Jitless mode skips the
 * probe; validation results are identical. Imported first in main.tsx so it runs before any parse.
 */
z.config({ jitless: true });
