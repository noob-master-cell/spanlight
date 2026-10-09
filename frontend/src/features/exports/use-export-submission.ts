import { useRef, useState } from "react";

import { newIdempotencyKey, type CreateExportInput } from "@/lib/api";

import { useCreateExport } from "./export-queries";
import { isExportNotConfigured } from "./export-status";

interface Attempt {
  key: string;
  /** The request the key was first used for; empty until the first submit. */
  body: string;
}

/**
 * Starts one trace export, safely retryable. A key is minted when the dialog opens and sent with
 * every submit of the same request, so a retry after a dropped connection or a `5xx` returns the
 * export the first attempt made instead of queueing a second one. A new key is used only when:
 *
 * - the request changed (the same key with a different body is `422 IDEMPOTENCY_MISMATCH`);
 * - the export was accepted;
 * - the server answered `409 NOT_CONFIGURED`, which it keeps for 24 hours per key, so a retry after
 *   an administrator sets up storage must not be sent with the old one.
 */
export function useExportSubmission() {
  const mutation = useCreateExport();
  const [openedWithKey] = useState(newIdempotencyKey);
  const attempt = useRef<Attempt>({ key: openedWithKey, body: "" });

  function fresh(): void {
    attempt.current = { key: newIdempotencyKey(), body: "" };
  }

  function submit(input: CreateExportInput): void {
    const body = JSON.stringify(input);
    if (attempt.current.body !== "" && attempt.current.body !== body) {
      attempt.current = { key: newIdempotencyKey(), body };
    } else {
      attempt.current.body = body;
    }
    mutation.mutate(
      { input, idempotencyKey: attempt.current.key },
      {
        onSuccess: fresh,
        onError: (error) => {
          if (isExportNotConfigured(error)) {
            fresh();
          }
        },
      },
    );
  }

  return {
    submit,
    isPending: mutation.isPending,
    /** The accepted export (status `queued`), once the server has answered. */
    created: mutation.data ?? null,
    error: mutation.error,
  };
}
