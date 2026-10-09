import type { Path, UseFormSetError } from "react-hook-form";

import { applyMappedFieldErrors } from "@/lib/form-errors";

import { formFieldFromServerPath, type RouteFormValues } from "./route-form";

/**
 * Puts a `422`'s field errors (`config.targets.0.credential_id`, …) on the editor's fields.
 * Returns true when at least one error found its field, so the caller can skip a generic toast.
 */
export function applyRouteFieldErrors(
  error: unknown,
  setError: UseFormSetError<RouteFormValues>,
): boolean {
  // The mapping only returns paths that exist in the form.
  return applyMappedFieldErrors(
    error,
    setError,
    (path) => formFieldFromServerPath(path) as Path<RouteFormValues> | null,
  );
}
