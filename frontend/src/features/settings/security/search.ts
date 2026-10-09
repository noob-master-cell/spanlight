import { z } from "zod";

/**
 * The search of the Security page. `error` is an OAuth error code, put there by the callback
 * redirect when connecting a provider failed; the page shows it once and clears it.
 */
export const securitySearchSchema = z.object({
  error: z.string().optional().catch(undefined),
});
