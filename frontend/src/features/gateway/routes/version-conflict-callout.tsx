import { RotateCw } from "lucide-react";

import { Callout } from "@/components/callout";
import { Button } from "@/components/ui/button";

interface VersionConflictCalloutProps {
  /** The version someone else saved (`current_version` of the 409). */
  version: number;
  reloading: boolean;
  onReload: () => void;
}

/** Figma "Gateway — Route editor — version conflict", with the spec §9.1 copy. */
export function VersionConflictCallout({
  version,
  reloading,
  onReload,
}: VersionConflictCalloutProps) {
  return (
    <Callout
      tone="warning"
      role="alert"
      title="This route changed while you were editing"
      action={
        <Button size="sm" loading={reloading} onClick={onReload}>
          {reloading ? null : <RotateCw aria-hidden />}
          Reload latest
        </Button>
      }
    >
      Someone saved version {version} while you were editing. Reload latest to see their changes;
      your edits will be lost.
    </Callout>
  );
}
