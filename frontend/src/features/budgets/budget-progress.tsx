import { UnknownValue } from "@/components/unknown-value";
import type { Budget } from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  barFill,
  formatUsd,
  isExceeded,
  NOT_EVALUATED_REASON,
  percentLabel,
  spendRatio,
} from "./budget-period";

// A state with no spend: a new period not evaluated yet, or no priced spend in the scope.
const UNMEASURED_REASON =
  "No spend measured in this period yet. It shows within a minute if the scope has priced spend.";

/**
 * Figma "Budgets/Progress": "$52.31 of $50.00", the percent, and an 8 px bar. Violet below the
 * amount, the danger colour above 100 % (the figures turn danger too, so the state never
 * rests on colour alone). Before the first evaluation the spend is "—" and the bar is empty. The
 * bar repeats the printed figures, so it is hidden from assistive technology.
 */
export function BudgetProgress({ budget }: { budget: Budget }) {
  const spent = budget.state?.spent_usd ?? null;
  const ratio = spendRatio(spent, budget.amount_usd);
  const exceeded = isExceeded(ratio);
  const amount = formatUsd(budget.amount_usd) ?? budget.amount_usd;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="flex items-baseline gap-1 text-[13px] leading-normal">
        {spent === null ? (
          <UnknownValue
            reason={budget.state === null ? NOT_EVALUATED_REASON : UNMEASURED_REASON}
            className="font-semibold"
          />
        ) : (
          <span
            className={cn(
              "font-semibold tabular",
              exceeded ? "text-danger-text" : "text-foreground",
            )}
          >
            {formatUsd(spent)}
          </span>
        )}
        <span className="font-medium text-muted-foreground tabular">of {amount}</span>
        {ratio === null ? null : (
          <span
            className={cn(
              "ml-auto text-xs font-semibold tabular",
              exceeded ? "text-danger-text" : "text-muted-foreground",
            )}
          >
            {percentLabel(ratio)}
          </span>
        )}
      </p>
      <div aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-border">
        {ratio === null ? null : (
          <div
            className={cn("h-full rounded-full", exceeded ? "bg-danger" : "bg-accent")}
            style={{ width: `${barFill(ratio) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
