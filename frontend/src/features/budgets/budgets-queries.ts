import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useProjectParams } from "@/features/shell";
import { budgetsApi, queryKeys, type BudgetInput, type BudgetUpdate } from "@/lib/api";

export { useAlertChannelsQuery } from "@/features/alerts";
export { useGatewayKeysQuery } from "@/features/gateway";

/** The project's budgets with their last evaluated state. Evaluation runs every minute. */
export function useBudgetsQuery() {
  const { projectId } = useProjectParams();
  return useQuery({
    queryKey: queryKeys.project(projectId).budgets,
    queryFn: () => budgetsApi.list(projectId),
    refetchInterval: 60_000,
  });
}

function useInvalidateBudgets() {
  const { projectId } = useProjectParams();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId).budgets });
}

export function useCreateBudget() {
  const { projectId } = useProjectParams();
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: (input: BudgetInput) => budgetsApi.create(projectId, input),
    onSuccess: invalidate,
  });
}

export function useUpdateBudget() {
  const { projectId } = useProjectParams();
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: ({ budgetId, update }: { budgetId: string; update: BudgetUpdate }) =>
      budgetsApi.update(projectId, budgetId, update),
    onSuccess: invalidate,
  });
}

export function useDeleteBudget() {
  const { projectId } = useProjectParams();
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: (budgetId: string) => budgetsApi.delete(projectId, budgetId),
    onSuccess: invalidate,
  });
}
