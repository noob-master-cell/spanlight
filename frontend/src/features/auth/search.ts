import { z } from "zod";

export const authSearchSchema = z.object({
  next: z.string().optional().catch(undefined),
});

export type AuthSearch = z.infer<typeof authSearchSchema>;

/** Only allow same-origin relative paths as post-login destinations (no open redirects). */
export function safeNextPath(next: string | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return null;
  }
  return next;
}
