import { useFormContext } from "react-hook-form";

import { FormField } from "@/components/form-field";
import { SectionCard } from "@/components/section-card";
import { Input } from "@/components/ui/input";

import { TIMEOUT_MAX_MS, TIMEOUT_MIN_MS, type RouteFormValues } from "./route-form";

/** The Timeout card: the whole budget of one call. */
export function TimeoutField() {
  const { register, formState } = useFormContext<RouteFormValues>();

  return (
    <SectionCard
      title="Timeout"
      description="The whole budget for every attempt, wait and fallback."
      className="gap-4"
    >
      <FormField
        label="Timeout (ms)"
        hint="1,000–600,000 ms. For streams it bounds the time to the first byte; a 60 s idle limit applies between chunks."
        error={formState.errors.timeout_ms?.message}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={TIMEOUT_MIN_MS}
          max={TIMEOUT_MAX_MS}
          step={1}
          className="tabular sm:max-w-[240px]"
          {...register("timeout_ms", { valueAsNumber: true })}
        />
      </FormField>
    </SectionCard>
  );
}
