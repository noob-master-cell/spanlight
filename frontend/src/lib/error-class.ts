import type { ErrorClass } from "@/lib/api";

/** Plain-language names for the failure classes, as the filter menu and chips show them. */
const ERROR_CLASS_LABELS: Record<ErrorClass, string> = {
  auth: "Authentication",
  rate_limit: "Rate limited",
  timeout: "Timed out",
  context_length: "Context too long",
  content_filter: "Content filtered",
  provider_5xx: "Provider error",
  network: "Network",
  client: "Client error",
  unknown: "Unknown",
};

/**
 * Every class, in menu order. Derived from the label map, which the compiler forces to name each
 * `ErrorClass`, so a class added to the API cannot be dropped from the URL or the menu silently.
 */
export const ERROR_CLASSES = Object.keys(ERROR_CLASS_LABELS) as [ErrorClass, ...ErrorClass[]];

export function isErrorClass(value: string): value is ErrorClass {
  return (ERROR_CLASSES as readonly string[]).includes(value);
}

export function errorClassLabel(errorClass: ErrorClass): string {
  return ERROR_CLASS_LABELS[errorClass];
}
