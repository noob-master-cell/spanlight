import { z } from "zod";

export const onboardingSearchSchema = z.object({
  org: z.string().optional().catch(undefined),
  project: z.string().optional().catch(undefined),
});

export type OnboardingSearch = z.infer<typeof onboardingSearchSchema>;
