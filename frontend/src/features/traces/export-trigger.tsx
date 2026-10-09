import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { usePermission } from "@/features/shell";

import { ExportDialog } from "./export-dialog";

/**
 * The Traces page's Export button (Figma page header, secondary with a download icon). Members and
 * above can export; for a viewer it is off, with the reason on hover and focus.
 */
export function ExportTracesButton() {
  const canExport = usePermission("export:create");

  if (!canExport) {
    const reason = "Viewers can't export traces. Ask an admin for access.";
    return (
      <Tooltip content={reason}>
        <span tabIndex={0} className="inline-flex rounded-full">
          <Button variant="secondary" size="lg" disabled>
            <Download aria-hidden />
            Export
          </Button>
          <span className="sr-only">{reason}</span>
        </span>
      </Tooltip>
    );
  }

  return (
    <ExportDialog
      trigger={
        <Button variant="secondary" size="lg">
          <Download aria-hidden />
          Export
        </Button>
      }
    />
  );
}
