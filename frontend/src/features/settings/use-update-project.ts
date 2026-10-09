import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useProjectParams } from "@/features/shell/project-context";
import { projectsApi, queryKeys, type ProjectUpdate } from "@/lib/api";

/** PATCH the current project and keep the cached detail and the org's project list in sync. */
export function useUpdateProject() {
  const { orgId, projectId } = useProjectParams();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: ProjectUpdate) => projectsApi.update(projectId, update),
    onSuccess: (project) => {
      queryClient.setQueryData(queryKeys.project(projectId).detail, project);
      void queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).projects });
    },
  });
}
