import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { refreshMe } from "@/features/auth/queries";
import { authApi, errorMessage, isApiError } from "@/lib/api";

export const DEMO_NOT_CONFIGURED_MESSAGE = "The live demo isn't configured on this server.";
export const DEMO_RATE_LIMITED_MESSAGE =
  "Too many demo sessions from your network. Try again in an hour.";

/** What the visitor is told when starting the demo fails. */
export function demoErrorMessage(error: unknown): string {
  if (isApiError(error) && error.status === 404) {
    return DEMO_NOT_CONFIGURED_MESSAGE;
  }
  if (isApiError(error) && error.status === 429) {
    return DEMO_RATE_LIMITED_MESSAGE;
  }
  return errorMessage(error);
}

/**
 * "Try the live demo": the same demo-session call as the sign-in page. On success the session
 * is re-read and "/" sends the new demo viewer to the demo workspace; on failure the visitor
 * stays on the landing page with a toast.
 */
export function useStartDemo() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: authApi.demoSession,
    onSuccess: async () => {
      await refreshMe(queryClient);
      await navigate({ to: "/" });
    },
    onError: (error) => {
      toast.error(demoErrorMessage(error));
    },
  });
}
