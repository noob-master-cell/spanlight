import { CircleAlert } from "lucide-react";
import { cloneElement, useId, type ReactElement, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: ReactNode;
  /** The input element. It receives id, aria-invalid and aria-describedby. */
  children: ReactElement<{
    id?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
  }>;
  error?: string | undefined;
  hint?: ReactNode;
  labelAction?: ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired together for assistive technology. */
export function FormField({
  label,
  children,
  error,
  hint,
  labelAction,
  className,
}: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {hint && !error ? (
        <p id={hintId} className="text-xs font-medium text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-xs font-medium text-danger-text">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2.25} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
