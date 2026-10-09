import { ArrowRight, Plus, X } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { MAX_MODEL_ALIASES, type RouteFormValues } from "./route-form";

/**
 * Figma "Gateway/Alias row": requested model → model sent to the provider, one row per alias,
 * with remove and "Add alias". Each pair of inputs is named for screen readers by its row.
 */
export function AliasRows({ targetIndex }: { targetIndex: number }) {
  const { control, register, formState } = useFormContext<RouteFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `targets.${targetIndex}.aliases`,
  });
  const errors = formState.errors.targets?.[targetIndex]?.aliases;
  const listError = errors?.root?.message ?? errors?.message;
  const position = targetIndex + 1;

  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-x-2 text-label font-semibold text-foreground">
        Model aliases
        <span className="text-xs font-medium text-muted-foreground">
          Requested model → model sent to the provider
        </span>
      </p>
      {fields.length === 0 ? (
        <p className="text-xs font-medium text-muted-foreground">
          No aliases. Models are sent as requested.
        </p>
      ) : (
        <ul aria-label={`Model aliases of target ${position}`} className="flex flex-col gap-2">
          {fields.map((field, index) => {
            const rowErrors = errors?.[index];
            const message = rowErrors?.from?.message ?? rowErrors?.to?.message;
            const errorId = `${field.id}-error`;
            return (
              <li key={field.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Requested model, alias ${index + 1}`}
                    aria-invalid={rowErrors?.from ? true : undefined}
                    aria-describedby={message ? errorId : undefined}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-10 font-mono text-label"
                    {...register(`targets.${targetIndex}.aliases.${index}.from`, {
                      // A duplicate is reported on the later row; changing any requested model
                      // re-checks every row, so fixing either one clears the error.
                      deps: [`targets.${targetIndex}.aliases`],
                    })}
                  />
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <Input
                    aria-label={`Model sent to the provider, alias ${index + 1}`}
                    aria-invalid={rowErrors?.to ? true : undefined}
                    aria-describedby={message ? errorId : undefined}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-10 font-mono text-label"
                    {...register(`targets.${targetIndex}.aliases.${index}.to`)}
                  />
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    className="shadow-none"
                    aria-label={`Remove alias ${index + 1}`}
                    onClick={() => {
                      remove(index);
                    }}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
                {message ? (
                  <p id={errorId} className="text-xs font-medium text-danger-text">
                    {message}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {listError ? <p className="text-xs font-medium text-danger-text">{listError}</p> : null}
      {fields.length < MAX_MODEL_ALIASES ? (
        <Button
          variant="link"
          size="sm"
          className="self-start text-xs"
          onClick={() => {
            append({ from: "", to: "" });
          }}
        >
          <Plus aria-hidden />
          Add alias
        </Button>
      ) : (
        <p className="text-xs font-medium text-muted-foreground">
          A target can have up to {MAX_MODEL_ALIASES} aliases.
        </p>
      )}
    </div>
  );
}
