import { z } from "zod";

import { projectSearchSchema } from "@/lib/time-range";

/** URL-synced sort of the end-user list. */
export const usersSearchSchema = projectSearchSchema.extend({
  sort: z.enum(["cost", "errors", "traces"]).default("cost").catch("cost"),
});

export type UsersSearch = z.infer<typeof usersSearchSchema>;
