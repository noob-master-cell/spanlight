import { Controller, type UseFormReturn } from "react-hook-form";

import { FormField } from "@/components/form-field";

import { FieldSelect } from "./field-select";
import { RULE_EDITOR_COPY, windowOptionLabel, windowOptions } from "./rule-form-options";
import type { RuleFormValues } from "./rule-form-schema";
import { UnitInput } from "./unit-input";

interface TimingFieldsProps {
  form: UseFormReturn<RuleFormValues>;
}

/** Figma "Window row": how long a window the metric is measured over, and the cooldown. */
export function TimingFields({ form }: TimingFieldsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
      <Controller
        control={form.control}
        name="windowMinutes"
        render={({ field, fieldState }) => (
          <FormField label="Window" error={fieldState.error?.message}>
            <FieldSelect
              ref={field.ref}
              value={String(field.value)}
              onChange={(next) => {
                field.onChange(Number(next));
              }}
              options={windowOptions(field.value).map((minutes) => ({
                value: String(minutes),
                label: windowOptionLabel(minutes),
              }))}
            />
          </FormField>
        )}
      />
      <FormField
        label={
          <>
            Cooldown<span className="sr-only"> in minutes</span>
          </>
        }
        hint={RULE_EDITOR_COPY.cooldownHint}
        error={form.formState.errors.cooldownMinutes?.message}
      >
        <UnitInput suffix="min" inputMode="numeric" {...form.register("cooldownMinutes")} />
      </FormField>
    </div>
  );
}
