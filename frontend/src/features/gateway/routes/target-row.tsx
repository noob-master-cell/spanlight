import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useFormContext } from "react-hook-form";

import { FormField } from "@/components/form-field";
import { UnknownValue } from "@/components/unknown-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Credential } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AliasRows } from "./alias-rows";
import { CredentialSelect } from "./credential-select";
import { WEIGHT_MAX, WEIGHT_MIN, type RouteFormValues } from "./route-form";

interface TargetRowProps {
  index: number;
  count: number;
  /** This target's ≈ share of first picks in whole percent, or null while a weight is invalid. */
  sharePercent: number | null;
  credentials: readonly Credential[];
  actions: TargetActions;
}

interface TargetActions {
  move: (from: number, to: number) => void;
  remove: (index: number) => void;
}

/*
 * Each group is a three-row grid (label, control, message) whose fields are subgrids, so the
 * position badge, the share and the buttons sit centred on the control row whatever the label or
 * message heights. The two groups wrap onto separate lines on narrow cards.
 */
const GROUP = "grid grid-rows-[auto_auto_auto] gap-x-3 gap-y-2";
const FIELD = "row-span-3 grid grid-rows-subgrid gap-y-2";

/**
 * Figma "Gateway/Target row": position, credential, weight, ≈ first-pick share, reorder and
 * remove, then the target's model aliases. Order is the fallback order.
 */
export function TargetRow({ index, count, sharePercent, credentials, actions }: TargetRowProps) {
  const { register, formState } = useFormContext<RouteFormValues>();
  const errors = formState.errors.targets?.[index];
  const position = index + 1;

  return (
    <li
      aria-label={`Target ${position}`}
      className="flex flex-col gap-4 rounded-tile bg-surface-muted p-4"
    >
      <div className="flex flex-wrap gap-x-3">
        <div className={cn(GROUP, "min-w-[220px] flex-[2_1_260px] grid-cols-[auto_minmax(0,1fr)]")}>
          <span
            aria-hidden
            className="col-start-1 row-start-2 flex size-6 items-center justify-center self-center rounded-full border border-border bg-surface text-xs font-semibold tabular"
          >
            {position}
          </span>
          <FormField
            label="Credential"
            error={errors?.credential_id?.message}
            className={cn(FIELD, "col-start-2 row-start-1")}
          >
            <CredentialSelect index={index} credentials={credentials} />
          </FormField>
        </div>
        <div className={cn(GROUP, "flex-[1_1_auto] grid-cols-[104px_minmax(0,1fr)_auto]")}>
          <FormField
            label="Weight"
            error={errors?.weight?.message}
            className={cn(FIELD, "col-start-1 row-start-1")}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={WEIGHT_MIN}
              max={WEIGHT_MAX}
              step={1}
              className="tabular"
              {...register(`targets.${index}.weight`, { valueAsNumber: true })}
            />
          </FormField>
          <span
            aria-hidden
            className="col-start-2 row-start-1 text-label leading-5 font-semibold whitespace-nowrap text-foreground"
          >
            ≈ first-pick share
          </span>
          <span
            aria-live="polite"
            className="col-start-2 row-start-2 self-center text-sm font-semibold tabular"
          >
            <span className="sr-only">Target {position} first-pick share, about </span>
            {sharePercent === null ? (
              <UnknownValue reason="Fix the weights to see each target's share." />
            ) : (
              `${sharePercent}%`
            )}
          </span>
          <TargetButtons index={index} count={count} actions={actions} />
        </div>
      </div>
      <AliasRows targetIndex={index} />
    </li>
  );
}

function TargetButtons({
  index,
  count,
  actions,
}: Omit<TargetRowProps, "sharePercent" | "credentials">) {
  const position = index + 1;
  return (
    <div className="col-start-3 row-start-2 flex items-center gap-1.5 self-center justify-self-end">
      <Button
        variant="secondary"
        size="icon-sm"
        className="shadow-none"
        aria-label={`Move target ${position} up`}
        disabled={index === 0}
        onClick={() => {
          actions.move(index, index - 1);
        }}
      >
        <ArrowUp aria-hidden />
      </Button>
      <Button
        variant="secondary"
        size="icon-sm"
        className="shadow-none"
        aria-label={`Move target ${position} down`}
        disabled={index === count - 1}
        onClick={() => {
          actions.move(index, index + 1);
        }}
      >
        <ArrowDown aria-hidden />
      </Button>
      <Button
        variant="secondary"
        size="icon-sm"
        className="shadow-none"
        aria-label={`Remove target ${position}`}
        disabled={count === 1}
        onClick={() => {
          actions.remove(index);
        }}
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}
