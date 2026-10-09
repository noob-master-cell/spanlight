import { Controller, type UseFormReturn } from "react-hook-form";

import { FormField } from "@/components/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";

import { ChipInput } from "./chip-input";
import { cacheOptionsFor, modelNameProblem, tagProblem, type KeyFormValues } from "./key-form";
import type { DraftField } from "./use-draft-problems";

interface KeyListFieldsProps {
  form: UseFormReturn<KeyFormValues>;
  /** Reports what each chip field still holds in its text box, so Save can refuse it. */
  reportDraft: (field: DraftField) => (message: string | null) => void;
  layout: "dialog" | "sheet";
  /** The key's cache TTL now, so an API-set TTL that is not a preset still shows. */
  currentCacheTtl: number | null;
}

/** The lower half of the key fields: allowed models, default tags and the cache choice. */
export function KeyListFields({ form, reportDraft, layout, currentCacheTtl }: KeyListFieldsProps) {
  const { errors } = form.formState;

  return (
    <>
      <Controller
        control={form.control}
        name="allowedModels"
        render={({ field }) => (
          <FormField
            label="Allowed models"
            hint="Leave empty to allow any model."
            error={errors.allowedModels?.message}
          >
            <ChipInput
              value={field.value}
              onChange={field.onChange}
              placeholder={layout === "dialog" ? "Add a model" : "Any model"}
              validate={modelNameProblem}
              onDraftProblem={reportDraft("allowedModels")}
            />
          </FormField>
        )}
      />

      <Controller
        control={form.control}
        name="defaultTags"
        render={({ field }) => (
          <FormField
            label="Default tags"
            hint="Added to every trace from this key."
            error={errors.defaultTags?.message}
          >
            <ChipInput
              value={field.value}
              onChange={field.onChange}
              placeholder="Add a tag"
              validate={tagProblem}
              onDraftProblem={reportDraft("defaultTags")}
            />
          </FormField>
        )}
      />

      <Controller
        control={form.control}
        name="cache"
        render={({ field }) => (
          <div className="grid gap-2">
            <p className="text-label font-semibold text-foreground">Cache</p>
            <SegmentedControl
              aria-label="Cache"
              tone="surface"
              value={field.value}
              onValueChange={field.onChange}
              options={cacheOptionsFor(currentCacheTtl)}
              className="flex w-full [&>button]:flex-1"
            />
            <p className="text-xs font-medium text-muted-foreground">
              Caches identical non-streaming requests. Hits cost nothing and are marked in traces.
            </p>
          </div>
        )}
      />
    </>
  );
}
