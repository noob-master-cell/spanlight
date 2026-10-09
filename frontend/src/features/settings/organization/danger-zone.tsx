import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useOrgProjectsQuery } from "@/features/shell";
import type { Org } from "@/lib/api";

import { ConfirmSlugDialog } from "../confirm-slug-dialog";
import { orgDeleteExplanation } from "../danger-copy";
import { DangerZoneCard } from "../danger-zone-card";
import { ProjectsTile } from "./projects-tile";
import { useDeleteOrganization } from "./use-delete-organization";

/**
 * The organization's "Danger zone" (Figma "Settings — Organization"): delete it with its projects,
 * members and audit log, by typing its slug. The page shows it to owners of a real organization
 * only; the public demo organization never gets one.
 */
export function OrgDangerZone({ org }: { org: Org }) {
  const projectsQuery = useOrgProjectsQuery(org.id);
  const deleteOrganization = useDeleteOrganization(org);
  const explanation = orgDeleteExplanation(org.name, projectsQuery.data?.length ?? null);

  return (
    <DangerZoneCard label="Delete organization" explanation={explanation}>
      <ConfirmSlugDialog
        trigger={<Button variant="danger">Delete organization</Button>}
        slug={org.slug}
        copy={{
          title: "Delete organization",
          description: explanation,
          confirmLabel: "Delete organization",
        }}
        onConfirm={async (confirm) => {
          await deleteOrganization(confirm);
          toast.success(`Deleted ${org.name}.`);
        }}
      >
        <ProjectsTile projects={projectsQuery.data} failed={projectsQuery.isError} />
      </ConfirmSlugDialog>
    </DangerZoneCard>
  );
}
