import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/api";

import { ConfirmSlugDialog } from "./confirm-slug-dialog";
import { DangerZoneCard } from "./danger-zone-card";
import { projectDeleteExplanation } from "./danger-copy";
import { useDeleteProject } from "./use-delete-project";

/**
 * The project's "Danger zone" (Figma "Settings — Project v2"): delete it, its API keys and its
 * traces, by typing its slug. The page decides who sees it; this only builds it.
 */
export function ProjectDangerZone({ project }: { project: Project }) {
  const deleteProject = useDeleteProject(project);
  const explanation = projectDeleteExplanation(project.name);

  return (
    <DangerZoneCard label="Delete project" explanation={explanation}>
      <ConfirmSlugDialog
        trigger={<Button variant="danger">Delete project</Button>}
        slug={project.slug}
        copy={{
          title: "Delete project",
          description: explanation,
          confirmLabel: "Delete project",
        }}
        onConfirm={async (confirm) => {
          await deleteProject(confirm);
          toast.success(`Deleted ${project.name}.`);
        }}
      />
    </DangerZoneCard>
  );
}
