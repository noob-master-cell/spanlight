import type { ReactNode } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { MetricPreviewChart } from "./metric-preview-chart";
import type { RuleFormValues } from "./rule-form-schema";
import { useRulePreview } from "./use-rule-preview";

const PREVIEW_COPY = {
  title: "Preview",
  caption: "Last 7 days",
  approximate: "≈ Older hours use hourly summaries, so percentiles are approximate.",
  empty: "No data in the last 7 days for these filters.",
  blocked: "Fix the highlighted fields to see a preview.",
  incomplete: "Enter a threshold to see a preview.",
  paused: "Preview paused: too many previews this minute. Change a field to try again shortly.",
  failed: "Couldn't load the preview.",
} as const;

const FADE = "transition-opacity duration-200 motion-reduce:transition-none";

interface RulePreviewPanelProps {
  form: UseFormReturn<RuleFormValues>;
  projectId: string;
}

/**
 * Figma "Preview": what the rule would have seen over the last 7 days, refreshed half a second
 * after the definition last changed. Blocked while a field is invalid; the empty, paused and
 * failed states keep the panel's height so the dialog doesn't jump.
 */
export function RulePreviewPanel({ form, projectId }: RulePreviewPanelProps) {
  const values = useWatch({ control: form.control }) as RuleFormValues;
  const state = useRulePreview(projectId, values);
  const hasVisibleErrors = Object.keys(form.formState.errors).length > 0;

  let body: ReactNode;
  if (state.status === "blocked") {
    body = <Message>{hasVisibleErrors ? PREVIEW_COPY.blocked : PREVIEW_COPY.incomplete}</Message>;
  } else if (state.status === "loading") {
    body = (
      <div role="status" className="relative">
        <span className="sr-only">Loading preview…</span>
        <Skeleton className="h-[176px] w-full rounded-tile" />
      </div>
    );
  } else if (state.status === "paused") {
    body = <Message>{PREVIEW_COPY.paused}</Message>;
  } else if (state.status === "error") {
    body = (
      <Message>
        {PREVIEW_COPY.failed}
        <Button size="sm" onClick={state.retry}>
          Try again
        </Button>
      </Message>
    );
  } else if (!state.series.hasData) {
    body = <Message dimmed={state.refreshing}>{PREVIEW_COPY.empty}</Message>;
  } else {
    body = (
      <div className={cn("flex flex-col gap-2.5", FADE, state.refreshing && "opacity-60")}>
        <MetricPreviewChart
          series={state.series}
          metric={values.metric}
          kind={values.kind}
          comparator={values.comparator}
        />
        {state.series.approximate ? (
          <p className="text-xs font-medium text-muted-foreground">{PREVIEW_COPY.approximate}</p>
        ) : null}
      </div>
    );
  }

  return (
    <section
      aria-label={`${PREVIEW_COPY.title}, ${PREVIEW_COPY.caption.toLowerCase()}`}
      aria-busy={state.status === "loading" || (state.status === "ready" && state.refreshing)}
      className="flex flex-col gap-2.5 rounded-tile bg-surface-muted px-[18px] pt-4 pb-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{PREVIEW_COPY.title}</h3>
        <p className="text-xs font-medium text-muted-foreground">{PREVIEW_COPY.caption}</p>
      </div>
      {body}
    </section>
  );
}

function Message({ children, dimmed = false }: { children: ReactNode; dimmed?: boolean }) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-[104px] flex-col items-center justify-center gap-3 px-4 py-6 text-center text-sm text-muted-foreground",
        FADE,
        dimmed && "opacity-60",
      )}
    >
      {children}
    </div>
  );
}
