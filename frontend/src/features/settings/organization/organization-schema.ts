import { z } from "zod";

import type { Org } from "@/lib/api";

/** The server's limit for an organization's name (`docs/api-deviations.md`: trimmed, 1 to 100). */
export const ORG_NAME_MAX_LENGTH = 100;

export const orgNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter an organization name.")
    .max(ORG_NAME_MAX_LENGTH, `Use ${ORG_NAME_MAX_LENGTH} characters or fewer.`),
});

export type OrgNameValues = z.infer<typeof orgNameSchema>;

/** Whether saving would change anything: the trimmed name differs from the stored one. */
export function isNameChanged(org: Pick<Org, "name">, values: OrgNameValues): boolean {
  return values.name.trim() !== org.name;
}
