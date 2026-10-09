import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useCurrentOrg, useProjectParams } from "@/features/shell";
import { ExportTooLargeError, errorMessage, orgsApi, type AuditFilters } from "@/lib/api";

import { auditCsvFilename } from "./audit-filters";
import { saveBlob } from "./audit-download";

/**
 * Downloads the audit log as a CSV with the filters on screen. The file is fetched, not linked, so
 * a `422 EXPORT_TOO_LARGE` can be shown inline (`tooLarge`) instead of as a browser error page;
 * any other failure is a toast. `tooLarge` clears itself when the filters change or a new
 * download starts.
 */
export function useAuditCsv(filters: AuditFilters) {
  const { orgId } = useProjectParams();
  const org = useCurrentOrg();
  const filtersKey = JSON.stringify(filters);
  const [tooLargeFor, setTooLargeFor] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const file = await orgsApi.downloadAuditCsv(orgId, filters);
      saveBlob(file.blob, auditCsvFilename(org?.slug ?? orgId));
    },
    onMutate: () => {
      setTooLargeFor(null);
    },
    onError: (error) => {
      if (error instanceof ExportTooLargeError) {
        setTooLargeFor(filtersKey);
      } else {
        toast.error(errorMessage(error));
      }
    },
  });

  return {
    download: () => {
      mutation.mutate();
    },
    isPending: mutation.isPending,
    tooLarge: tooLargeFor === filtersKey,
  };
}
