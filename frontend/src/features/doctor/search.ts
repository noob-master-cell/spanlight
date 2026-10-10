import { z } from "zod";

import { projectSearchSchema } from "@/lib/time-range";

/** URL-synced filters for the Doctor's insight list: the status tab, severity and kind. */
export const doctorSearchSchema = projectSearchSchema.extend({
  status: z.enum(["open", "acknowledged", "muted", "resolved"]).default("open").catch("open"),
  severity: z.enum(["info", "warning", "critical"]).optional().catch(undefined),
  kind: z.string().optional().catch(undefined),
});

export type DoctorSearch = z.infer<typeof doctorSearchSchema>;
