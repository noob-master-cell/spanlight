import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { authApi, errorMessage, isApiError } from "@/lib/api";

import { refreshMe } from "./queries";

export function useDemoSession() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: authApi.demoSession,
    onSuccess: async () => {
      await refreshMe(queryClient);
      await navigate({ to: "/" });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 404) {
        toast.error("The live demo isn't enabled on this server.");
        return;
      }
      if (isApiError(error) && error.status === 429) {
        toast.error("Too many demo sessions from your network. Try again in an hour.");
        return;
      }
      toast.error(errorMessage(error));
    },
  });
}
