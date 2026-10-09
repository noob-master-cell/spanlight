const PRICED_CALLS = [
  { model: "claude-sonnet-4-5", tokens: "3,134 tok", cost: "$0.0182" },
  { model: "claude-haiku-4-5", tokens: "920 tok", cost: "$0.0018" },
  { model: "gpt-4.1-mini", tokens: "1,312 tok", cost: "$0.0009" },
] as const;

/**
 * Per-call cost rows (Figma "Illo/Cost"), ending with a model that has no price on file: it
 * shows "—" and a tooltip instead of $0. Phones drop the token column.
 */
export function CostIllustration() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between pb-1">
        <span className="text-overline text-subtle-foreground uppercase">Cost per call</span>
        <span className="rounded-full bg-lime px-3 py-[5px] text-xs font-bold text-lime-foreground">
          Unknown = —, never $0
        </span>
      </div>

      {PRICED_CALLS.map((call) => (
        <div
          key={call.model}
          className="flex items-center gap-2.5 rounded-input bg-surface-muted px-3.5 py-3"
        >
          <span className="size-2 shrink-0 rounded-full bg-kind-llm" />
          <span className="min-w-0 flex-1 truncate font-mono text-label text-foreground">
            {call.model}
          </span>
          <span className="hidden text-xs font-medium whitespace-nowrap text-subtle-foreground md:inline">
            {call.tokens}
          </span>
          <span className="w-16 text-right text-sm font-semibold text-foreground">{call.cost}</span>
        </div>
      ))}

      <div className="flex items-center gap-2.5 rounded-input border border-dashed border-border-strong bg-surface px-3.5 py-3">
        <span className="size-2 shrink-0 rounded-full bg-border-strong" />
        <span className="min-w-0 flex-1 truncate font-mono text-label text-foreground">
          llama-3.1-8b-instruct
        </span>
        <span className="hidden text-xs font-medium whitespace-nowrap text-subtle-foreground md:inline">
          1,204 tok
        </span>
        <span className="w-16 text-right text-sm font-semibold text-subtle-foreground">—</span>
      </div>

      <div className="flex justify-end">
        <span className="rounded-md bg-hero-card px-[13px] py-[9px] text-xs font-medium text-hero-card-foreground dark:border dark:border-border">
          No price on file, so it isn’t counted as $0.
        </span>
      </div>
    </div>
  );
}
