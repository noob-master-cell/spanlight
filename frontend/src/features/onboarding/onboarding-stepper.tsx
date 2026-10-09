import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import { ONBOARDING_STEPS, stepStatus, type OnboardingProgress, type StepStatus } from "./steps";

const PILL_CLASSES: Record<StepStatus, string> = {
  done: "border border-border bg-surface font-medium text-foreground",
  current: "bg-ink font-semibold text-ink-foreground",
  upcoming: "border border-border-strong font-medium text-muted-foreground",
};

const MARKER_CLASSES: Record<StepStatus, string> = {
  done: "bg-lime text-lime-foreground",
  // The pill turns lime in the dark theme, so the marker flips to ink with a lime number.
  current: "bg-lime text-lime-foreground dark:bg-ink-foreground dark:text-ink",
  upcoming: "border border-border-strong text-muted-foreground",
};

/** Screen-reader suffix. The current step is announced through aria-current instead. */
const STATUS_TEXT: Record<StepStatus, string> = {
  done: ", completed",
  current: "",
  upcoming: "",
};

interface OnboardingStepperProps {
  progress: OnboardingProgress;
  className?: string;
}

/**
 * The step pills in the onboarding header (Figma "Onboarding/Stepper"): done steps show a lime
 * check, the current step is an ink pill, upcoming steps are outlined. On phones only the
 * current step keeps its visible label.
 */
export function OnboardingStepper({ progress, className }: OnboardingStepperProps) {
  return (
    <nav aria-label="Setup progress" className={className}>
      <ol className="flex items-center gap-1.5 sm:gap-2.5">
        {ONBOARDING_STEPS.map((step, index) => {
          const status = stepStatus(step.id, progress);
          const isLast = index === ONBOARDING_STEPS.length - 1;
          return (
            <li
              key={step.id}
              aria-current={status === "current" ? "step" : undefined}
              className="flex items-center gap-1.5 sm:gap-2.5"
            >
              <span
                className={cn(
                  "flex items-center gap-2 rounded-full p-1 text-sm whitespace-nowrap sm:pr-3.5",
                  status === "current" && "pr-3.5",
                  PILL_CLASSES[status],
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular",
                    MARKER_CLASSES[status],
                  )}
                >
                  {status === "done" ? <Check className="size-3.5" strokeWidth={2.5} /> : index + 1}
                </span>
                <span className={cn(status !== "current" && "max-sm:sr-only")}>
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.label}
                  <span className="sr-only">{STATUS_TEXT[status]}</span>
                </span>
              </span>
              {isLast ? null : (
                <span
                  aria-hidden
                  className={cn(
                    "h-0.5 w-4 shrink-0 rounded-full sm:w-7",
                    status === "done" ? "bg-foreground" : "bg-border-strong",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
