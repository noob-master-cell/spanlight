import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { FormField } from "@/components/form-field";
import { SectionCard } from "@/components/section-card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import {
  BACKOFF_MAX_MS,
  MAX_ATTEMPTS_MAX,
  MAX_ATTEMPTS_MIN,
  MAX_BACKOFF_MAX_MS,
  type RouteFormValues,
} from "./route-form";
import { StatusChipsField } from "./status-chips-field";

/** The Retry policy card: attempts, backoff and its cap, retry statuses and Retry-After. */
export function RetryPolicyFields() {
  const { register, formState } = useFormContext<RouteFormValues>();
  const errors = formState.errors.retry;

  return (
    <SectionCard
      title="Retry policy"
      description="Retries the same target before falling back. The first try counts as an attempt."
      className="gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          label="Max attempts"
          hint={`${MAX_ATTEMPTS_MIN}–${MAX_ATTEMPTS_MAX} per target.`}
          error={errors?.max_attempts?.message}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={MAX_ATTEMPTS_MIN}
            max={MAX_ATTEMPTS_MAX}
            step={1}
            className="tabular"
            {...register("retry.max_attempts", { valueAsNumber: true })}
          />
        </FormField>
        <FormField
          label="Backoff (ms)"
          hint="0–10,000. Doubles on each retry."
          error={errors?.backoff_ms?.message}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={BACKOFF_MAX_MS}
            step={1}
            className="tabular"
            {...register("retry.backoff_ms", {
              valueAsNumber: true,
              // The cap is checked against the backoff, so it is re-checked when the backoff moves.
              deps: ["retry.max_backoff_ms"],
            })}
          />
        </FormField>
        <FormField
          label="Max backoff (ms)"
          hint="Up to 30,000. Caps the wait."
          error={errors?.max_backoff_ms?.message}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_BACKOFF_MAX_MS}
            step={1}
            className="tabular"
            {...register("retry.max_backoff_ms", { valueAsNumber: true })}
          />
        </FormField>
      </div>
      <StatusChipsField />
      <RetryAfterSwitch />
    </SectionCard>
  );
}

function RetryAfterSwitch() {
  const labelId = useId();
  const descriptionId = useId();
  const { control } = useFormContext<RouteFormValues>();

  return (
    <div className="flex items-start gap-3 rounded-tile bg-surface-muted px-4 py-3">
      <Controller
        control={control}
        name="retry.honour_retry_after"
        render={({ field }) => (
          <Switch
            ref={field.ref}
            checked={field.value}
            onCheckedChange={field.onChange}
            onBlur={field.onBlur}
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
          />
        )}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={labelId} className="text-sm font-semibold text-foreground">
          Honour Retry-After
        </span>
        <span id={descriptionId} className="text-xs font-medium text-muted-foreground">
          When the provider sends Retry-After, wait that long instead of the computed backoff.
        </span>
      </div>
    </div>
  );
}
