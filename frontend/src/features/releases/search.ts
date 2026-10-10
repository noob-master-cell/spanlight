import { z } from "zod";

import { projectSearchSchema } from "@/lib/time-range";

/** The two releases being compared: `a` is the baseline, `b` the candidate. */
export const releasesSearchSchema = projectSearchSchema.extend({
  a: z.string().optional().catch(undefined),
  b: z.string().optional().catch(undefined),
});

export type ReleasesSearch = z.infer<typeof releasesSearchSchema>;
