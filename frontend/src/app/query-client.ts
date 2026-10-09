import { QueryClient } from "@tanstack/react-query";

import { isApiError } from "@/lib/api";

/** Don't retry errors that won't fix themselves (4xx); retry transient ones twice. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429) {
    return false;
  }
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
