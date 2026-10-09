/**
 * The words and rules around an export's life: its status, when to keep polling, what a failure
 * means, and the answers to "can I download it" and "was storage missing". Pure functions only.
 */
import { ApiError, type ExportStatus, type TraceExport } from "@/lib/api";

/** How often the list asks again while an export is still being built. */
export const EXPORT_POLL_MS = 3000;

export const EXPORT_STATUS_LABELS: Record<ExportStatus, string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  expired: "Expired",
};

/** Queued and running exports change on their own; everything else is settled. */
export function isExportActive(status: ExportStatus): boolean {
  return status === "queued" || status === "running";
}

/**
 * The `refetchInterval` for the list: poll while any loaded export is queued or running, and
 * stop (false) otherwise so a settled list costs nothing.
 */
export function exportPollInterval(exports: readonly TraceExport[] | undefined): number | false {
  return exports?.some((entry) => isExportActive(entry.status)) ? EXPORT_POLL_MS : false;
}

export interface ExportFailure {
  /** The server's `error_code`, shown in mono. */
  code: string;
  message: string;
}

const FAILURE_MESSAGES: Record<string, string> = {
  EXPORT_TOO_LARGE: "More than 100,000 traces. Narrow the time range and export again.",
  EXPORT_TIMEOUT: "Building the file took too long. Narrow the time range and export again.",
  EXPORT_FAILED: "The file could not be built. Export again, or narrow the time range.",
  NOT_CONFIGURED: "Object storage was switched off before the file was written.",
};

const GENERIC_FAILURE = "The export did not finish. Export again.";

/** What to tell the user about a failed export; a code this client does not know still shows. */
export function exportFailure(errorCode: string | null): ExportFailure {
  // A failed export always carries a code; fall back to the catch-all if one ever arrives bare.
  const code = errorCode ?? "EXPORT_FAILED";
  return { code, message: FAILURE_MESSAGES[code] ?? GENERIC_FAILURE };
}

/** Why a value in the list is "—", by the status the export is in. */
export function unknownReason(status: ExportStatus): string {
  if (isExportActive(status)) {
    return "Known when the export finishes.";
  }
  return status === "failed" ? "The export failed before it finished." : "Not recorded.";
}

/** Why an expiry is "—": only a finished export has a file to expire. */
export function unknownExpiryReason(status: ExportStatus): string {
  if (isExportActive(status)) {
    return "Set when the export finishes.";
  }
  return status === "failed" ? "A failed export has no file to expire." : "Not recorded.";
}

/** Only a finished export has a file; "Download" shows for these and no others. */
export function isDownloadable(entry: Pick<TraceExport, "status">): boolean {
  return entry.status === "done";
}

/** `409 NOT_CONFIGURED`: the server has no object storage to write exports to. */
export function isExportNotConfigured(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === "NOT_CONFIGURED";
}

/**
 * The download link when it is safe to navigate to, else null. The server signs it, but it is
 * followed with `location.assign`, so only an http(s) address is ever used.
 */
export function safeDownloadUrl(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}
