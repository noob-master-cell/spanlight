import { ErrorState } from "@/components/error-state";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission, useProjectQuery } from "@/features/shell/project-context";

import { ProjectSettingsForm } from "./project-settings-form";
import { ReadOnlyNote } from "./read-only-note";

/**
 * General and Data settings. The design's "Danger zone" (delete project) is left out: the
 * API has no endpoint for deleting a project, and a button that can't work would mislead.
 */
export function ProjectSettingsPage() {
  const projectQuery = useProjectQuery();
  const canEdit = usePermission("project:write");

  if (projectQuery.isPending) {
    return <ProjectSettingsSkeleton />;
  }

  if (projectQuery.isError) {
    return (
      <Card>
        <ErrorState
          error={projectQuery.error}
          title="Couldn't load project settings"
          onRetry={() => {
            void projectQuery.refetch();
          }}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {canEdit ? null : (
        <ReadOnlyNote>Only admins and owners can change project settings.</ReadOnlyNote>
      )}
      {/* Keyed by project so switching projects starts a fresh form. */}
      <ProjectSettingsForm
        key={projectQuery.data.id}
        project={projectQuery.data}
        canEdit={canEdit}
      />
    </div>
  );
}

function ProjectSettingsSkeleton() {
  return (
    <div role="status" aria-label="Loading project settings" className="flex flex-col gap-5">
      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-[103px] rounded-input" />
          <Skeleton className="h-[103px] rounded-input" />
        </div>
      </Card>
      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-[103px] w-[220px] max-w-full rounded-input" />
        <Skeleton className="h-[78px] rounded-tile" />
      </Card>
    </div>
  );
}
