import { SectionCard } from "@/components/section-card";
import { UnknownValue } from "@/components/unknown-value";
import type { ModelShare } from "@/lib/api";
import { cn } from "@/lib/utils";

import { formatShare } from "./release-deltas";

/** Figma "Model mix": per model, a grey bar for A and a violet bar for B (share of LLM calls). */
export function ModelMix({ mix }: { mix: readonly ModelShare[] }) {
  return (
    <SectionCard
      title="Model mix"
      description="Share of LLM calls per model"
      actions={<Legend />}
      className="h-full"
    >
      {mix.length === 0 ? (
        <p className="text-sm text-muted-foreground">Neither release made LLM calls.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {mix.map((share) => (
            <li key={share.model ?? "unknown-model"} className="flex flex-col gap-1.5">
              <span className="truncate font-mono text-label font-semibold">
                {share.model ?? "Unknown model"}
              </span>
              <ShareBar
                side="A"
                share={share.a_share}
                model={share.model}
                barClass="bg-subtle-foreground"
              />
              <ShareBar side="B" share={share.b_share} model={share.model} barClass="bg-chart-1" />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function Legend() {
  return (
    <ul aria-hidden className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-subtle-foreground" />A
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-chart-1" />B
      </li>
    </ul>
  );
}

interface ShareBarProps {
  side: "A" | "B";
  share: number | null;
  model: string | null;
  barClass: string;
}

function ShareBar({ side, share, model, barClass }: ShareBarProps) {
  const label = formatShare(share);
  const width = share === null ? 0 : Math.min(100, Math.max(share * 100, share > 0 ? 1.5 : 0));
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="w-3 shrink-0 text-xs font-semibold text-muted-foreground">
        {side}
      </span>
      <span
        role="img"
        aria-label={`Release ${side}: ${label ?? "no calls"} of calls used ${model ?? "an unknown model"}`}
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted"
      >
        <span
          className={cn("block h-full rounded-full", barClass)}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular">
        {label ?? <UnknownValue reason="This release made no LLM calls in the window." />}
      </span>
    </div>
  );
}
