import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { isApiError } from "@/lib/api";

/**
 * Where a server field error goes in the form. A record maps the path's first segment
 * (`allowed_models.3` → `allowed_models`) to a form field; a function sees the whole path and
 * returns null for a path the form has no field for.
 */
export type FieldErrorMap<T extends FieldValues> =
  Readonly<Partial<Record<string, Path<T>>>> | ((path: string) => Path<T> | null);

/**
 * Copies field-level problem+json errors onto the form through `map`, so API names
 * (`base_url`) reach their form fields (`baseUrl`). Returns true when at least one error was
 * attached, so callers can skip a generic toast.
 */
export function applyMappedFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  map: FieldErrorMap<T>,
): boolean {
  if (!isApiError(error)) {
    return false;
  }
  let applied = false;
  for (const fieldError of error.fieldErrors) {
    const field =
      typeof map === "function" ? map(fieldError.field) : map[fieldError.field.split(".")[0] ?? ""];
    if (field) {
      setError(field, { type: "server", message: fieldError.message });
      applied = true;
    }
  }
  return applied;
}

/**
 * Copies field-level problem+json errors onto the form where the API and form names are the
 * same. Returns true when at least one error was attached, so callers can skip a generic toast.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  return applyMappedFieldErrors(
    error,
    setError,
    (path) => fields.find((candidate) => candidate === path) ?? null,
  );
}
