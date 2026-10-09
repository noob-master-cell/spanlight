import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { ExportsList, useExportsQuery } from "@/features/exports";
import { useProjectParams, useProjectQuery } from "@/features/shell";

import { SettingsSection } from "./settings-section";

/**
 * Settings › Exports: the project's trace exports, newest first. Exports are started from the
 * Traces page; this is where they are followed and downloaded. Nothing here asks whether the
 * server can write exports: that only shows when someone tries to start one.
 */
export function ExportsPage() {
  const query = useExportsQuery();
  const project = useProjectQuery();
  const isEmpty = query.isSuccess && query.data.pages[0]?.items.length === 0;
  const name = project.data?.name ?? "this project";

  return (
    <SettingsSection
      title="Exports"
      description={`Trace exports for ${name}, newest first.${isEmpty ? "" : " Start one from the Traces page."}`}
      actions={isEmpty ? null : <GoToTraces variant="secondary" />}
      className="gap-3"
    >
      <ExportsList query={query} emptyAction={<GoToTraces variant="primary" />} />
    </SettingsSection>
  );
}

function GoToTraces({ variant }: { variant: "primary" | "secondary" }) {
  const { orgId, projectId } = useProjectParams();
  return (
    <Button asChild variant={variant}>
      <Link to="/$orgId/$projectId/traces" params={{ orgId, projectId }}>
        Go to Traces
      </Link>
    </Button>
  );
}
