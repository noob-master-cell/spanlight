import { isApiError } from "@/lib/api";

/**
 * Whether what was typed confirms a deletion: the slug exactly, character for character. It is
 * neither trimmed nor case-folded, because the server compares it the same way, and a display
 * name or another casing must not enable the delete button.
 */
export function matchesSlug(typed: string, slug: string): boolean {
  return slug !== "" && typed === slug;
}

/**
 * `422 CONFIRMATION_MISMATCH`: the server did not accept what was typed. The button only enables
 * on an exact match, so this is a race (the slug changed under the dialog), not a typo.
 */
export function isConfirmationMismatch(error: unknown): boolean {
  return isApiError(error) && error.status === 422 && error.code === "CONFIRMATION_MISMATCH";
}

/** The inline error under the field for `isConfirmationMismatch`. */
export function mismatchMessage(slug: string): string {
  return `That doesn't match ${slug}.`;
}
