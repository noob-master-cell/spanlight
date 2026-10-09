import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { isApiError } from "@/lib/api";

/**
 * Copies field-level problem+json errors onto the form. Returns true when at
 * least one error was attached, so callers can skip a generic toast.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  if (!isApiError(error)) {
    return false;
  }
  let applied = false;
  for (const fieldError of error.fieldErrors) {
    const field = fields.find((candidate) => candidate === fieldError.field);
    if (field) {
      setError(field, { type: "server", message: fieldError.message });
      applied = true;
    }
  }
  return applied;
}
