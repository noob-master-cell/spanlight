import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { errorMessage, queryKeys, type Me, type Org } from "@/lib/api";

import {
  classifyRequireTwoFactorError,
  requirementSavedMessage,
  withOwnTwoFactor,
  type RequireTwoFactorProblem,
} from "./organization-flow";
import { useUpdateOrg } from "./use-update-org";

/**
 * How a save of the switch ended. `refused` is a `409` the card explains itself (see `problem`);
 * `failed` is anything else, already announced as a toast.
 */
export type RequirementOutcome = "saved" | "refused" | "failed";

/**
 * Saves "Require two-factor authentication". The switch shows the stored value, so a refusal
 * leaves it where it was: nothing has to be undone.
 */
export function useRequireTwoFactor(org: Org) {
  const queryClient = useQueryClient();
  const updateOrg = useUpdateOrg(org.id);
  const [problem, setProblem] = useState<RequireTwoFactorProblem | null>(null);

  async function save(required: boolean): Promise<RequirementOutcome> {
    setProblem(null);
    try {
      await updateOrg.mutateAsync({ require_2fa: required });
      toast.success(requirementSavedMessage(org.name, required));
      return "saved";
    } catch (error) {
      const refusal = classifyRequireTwoFactorError(error);
      if (refusal) {
        if (refusal === "not-enabled") {
          // The server knows better than a stale `me`: the card is blocked from `me` alone, and
          // unblocks when `me` next says the owner turned two-factor authentication on.
          queryClient.setQueryData<Me | null>(queryKeys.me, (me) =>
            me ? withOwnTwoFactor(me, false) : me,
          );
        }
        setProblem(refusal);
        return "refused";
      }
      toast.error(errorMessage(error));
      return "failed";
    }
  }

  return { save, pending: updateOrg.isPending, problem };
}
