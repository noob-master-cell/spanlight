import { z } from "zod";

import { ERROR_CLASSES } from "@/lib/error-class";
import { projectSearchSchema } from "@/lib/time-range";

/** URL-synced facet filters for the traces list. Keys are short to keep URLs readable. */
export const traceFiltersSchema = projectSearchSchema.extend({
  release: z.string().optional().catch(undefined),
  model: z.string().optional().catch(undefined),
  status: z.enum(["ok", "error"]).optional().catch(undefined),
  error_class: z.enum(ERROR_CLASSES).optional().catch(undefined),
  tag: z.string().optional().catch(undefined),
  user: z.string().optional().catch(undefined),
  session: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
});

export type TraceFilters = z.infer<typeof traceFiltersSchema>;

export const traceDetailSearchSchema = projectSearchSchema.extend({
  span: z.string().optional().catch(undefined),
});

export type TraceDetailSearch = z.infer<typeof traceDetailSearchSchema>;
