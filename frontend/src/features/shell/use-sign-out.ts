import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { clearBannerDismissal } from "@/features/auth";
import { authApi, errorMessage } from "@/lib/api";

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: async () => {
      queryClient.clear();
      clearBannerDismissal();
      await navigate({ to: "/login", search: {} });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}
