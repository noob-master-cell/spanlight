import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { SaveBarState } from "./save-bar-state";

interface RouteSaveBarProps {
  state: SaveBarState;
  saving: boolean;
  onCancel: () => void;
}

/**
 * The route editor's sticky bar: what saving will do, Discard (or Cancel on a new route) and
 * the submit button of the form it sits in. Announced politely as it changes.
 */
export function RouteSaveBar({ state, saving, onCancel }: RouteSaveBarProps) {
  return (
    <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-card border border-border bg-surface px-5 py-3.5 shadow-lg sm:flex-row sm:items-center sm:justify-between">
      <div role="status" className="flex min-w-0 items-start gap-2.5">
        <span
          aria-hidden
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            state.tone === "danger" ? "bg-danger" : "bg-warning",
          )}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{state.title}</p>
          <p className="text-xs font-medium text-muted-foreground">{state.detail}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          {state.cancelLabel}
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={state.submitDisabled}>
          {state.submitLabel}
        </Button>
      </div>
    </div>
  );
}
