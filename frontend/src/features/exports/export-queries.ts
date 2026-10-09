import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { useProjectParams } from "@/features/shell";
import {
  errorMessage,
  exportsApi,
  queryKeys,
  type CreateExportInput,
  type Page,
  type TraceExport,
} from "@/lib/api";

import { exportPollInterval, safeDownloadUrl } from "./export-status";

const EXPORT_PAGE_SIZE = 25;

/** Every export on the pages loaded so far, in list order. */
export function exportsOf(data: InfiniteData<Page<TraceExport>> | undefined): TraceExport[] {
  return data ? data.pages.flatMap((page) => page.items) : [];
}

/**
 * The project's exports, newest first. While any loaded export is queued or running the list asks
 * again every few seconds; once every one has settled it stops (and so does a hidden tab).
 */
export function useExportsQuery() {
  const { projectId } = useProjectParams();
  return useInfiniteQuery({
    queryKey: queryKeys.project(projectId).exports,
    queryFn: ({ pageParam }) =>
      exportsApi.list(projectId, { cursor: pageParam, limit: EXPORT_PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    // A list in error keeps its stale rows; polling them would only repeat the failure every few
    // seconds. A retry or a window refocus refetches, and a success starts polling again.
    refetchInterval: (query) =>
      query.state.status === "error" ? false : exportPollInterval(exportsOf(query.state.data)),
  });
}

interface CreateExportVariables {
  input: CreateExportInput;
  /** One key per submission: a retry of the same request sends the same key. */
  idempotencyKey: string;
}

/** `POST /exports`; a new export shows up in the list as soon as it is accepted. */
export function useCreateExport() {
  const { projectId } = useProjectParams();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreateExportVariables) =>
      exportsApi.create(projectId, input, idempotencyKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId).exports });
    },
  });
}

class ExportUnavailableError extends Error {
  constructor() {
    super("This export is no longer available. It may have expired.");
    this.name = "ExportUnavailableError";
  }
}

/**
 * Downloads one export. Links last an hour, so the one in the list may be stale: ask for the export
 * again to get a fresh link, then follow it. The file's own headers make the browser save it.
 */
export function useDownloadExport() {
  const { projectId } = useProjectParams();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (exportId: string): Promise<string> => {
      const entry = await exportsApi.get(projectId, exportId);
      const url = entry.download_url ? safeDownloadUrl(entry.download_url) : null;
      if (url === null) {
        throw new ExportUnavailableError();
      }
      return url;
    },
    onSuccess: (url) => {
      window.location.assign(url);
    },
    onError: (error) => {
      toast.error(error instanceof ExportUnavailableError ? error.message : errorMessage(error));
      // The export may have expired since the list loaded; show it as it is now.
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId).exports });
    },
  });
}
