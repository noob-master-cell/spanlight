import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import type { Credential } from "@/lib/api";

import { MAX_TARGETS, type RouteFormValues } from "./route-form";
import { firstPickPercents } from "./route-summary";
import { TargetRow } from "./target-row";

/**
 * The Targets card: up to eight targets in fallback order, each with its ≈ first-pick share from
 * the weights. At eight, Add target is disabled with the reason beside it.
 */
export function TargetsField({ credentials }: { credentials: readonly Credential[] }) {
  const { control, formState } = useFormContext<RouteFormValues>();
  const { fields, append, move, remove } = useFieldArray({ control, name: "targets" });
  const targets = useWatch({ control, name: "targets" });
  const percents = firstPickPercents(targets.map((target) => target.weight));
  const full = fields.length >= MAX_TARGETS;
  const listError = formState.errors.targets?.root?.message ?? formState.errors.targets?.message;

  return (
    <SectionCard
      title="Targets"
      description="The first target is picked by weight. If it fails with a fallback condition, the others are tried top to bottom."
      actions={
        <span className="text-xs font-medium text-muted-foreground tabular">
          {fields.length} of {MAX_TARGETS}
        </span>
      }
      className="gap-4"
    >
      <ol aria-label="Targets in fallback order" className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <TargetRow
            key={field.id}
            index={index}
            count={fields.length}
            sharePercent={percents[index] ?? null}
            credentials={credentials}
            actions={{ move, remove }}
          />
        ))}
      </ol>
      {listError ? (
        <p role="alert" className="text-xs font-medium text-danger-text">
          {listError}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Button
          variant="secondary"
          className="self-start shadow-none"
          disabled={full}
          onClick={() => {
            append({ credential_id: credentials[0]?.id ?? "", weight: 1, aliases: [] });
          }}
        >
          Add target
        </Button>
        <p className="text-xs font-medium text-muted-foreground">
          {full
            ? `A route can have up to ${MAX_TARGETS} targets.`
            : "Weights are 1–100. The same credential can appear in more than one target."}
        </p>
      </div>
    </SectionCard>
  );
}
