import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { authApi, errorMessage, isApiError, queryKeys } from "@/lib/api";

export type ResendState =
  | { kind: "idle" }
  | { kind: "sent" }
  | { kind: "already-verified" }
  | { kind: "error"; message: string };

/** The words for a refused resend. At most 3 links an hour, so a `429` is the one worth naming. */
function resendFailure(error: unknown): ResendState {
  if (isApiError(error) && error.status === 429) {
    return { kind: "error", message: "You've asked for 3 links this hour. Try again later." };
  }
  if (isApiError(error) && error.status === 409 && error.code === "NOT_CONFIGURED") {
    return { kind: "error", message: "Email isn't set up on this server." };
  }
  return { kind: "error", message: errorMessage(error) };
}

/** "Resend link": mails the signed-in user a fresh verification link, and keeps the outcome. */
export function useResendVerification() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ResendState>({ kind: "idle" });

  const request = useMutation({
    mutationFn: authApi.requestEmailVerification,
    onSuccess: () => {
      setState({ kind: "sent" });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409 && error.code === "EMAIL_ALREADY_VERIFIED") {
        // Verified in another tab or on another device since this page loaded: nothing left to ask.
        setState({ kind: "already-verified" });
        void queryClient.invalidateQueries({ queryKey: queryKeys.me });
        return;
      }
      setState(resendFailure(error));
    },
  });

  return {
    state,
    pending: request.isPending,
    resend: () => {
      setState({ kind: "idle" });
      request.mutate();
    },
  };
}
