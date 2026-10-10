import type { ErrorClass } from "@/lib/api";
import { errorClassLabel } from "@/lib/error-class";

/**
 * Figma "Traces/Error class chip": the failure class in plain words on a danger tint; the API's
 * code (`rate_limit`) is in the tooltip.
 */
export function ErrorClassChip({ errorClass }: { errorClass: ErrorClass }) {
  return (
    <span
      title={`Error class: ${errorClass}`}
      className="inline-flex shrink-0 items-center rounded-full bg-danger-subtle px-2 py-0.5 text-label text-danger-text"
    >
      {errorClassLabel(errorClass)}
    </span>
  );
}
