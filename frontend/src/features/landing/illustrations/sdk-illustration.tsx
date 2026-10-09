const CAPTURED_FIELDS = [
  "prompt",
  "completion",
  "model",
  "latency",
  "TTFT",
  "tokens",
  "cost",
  "errors",
] as const;

const SDK_HELPERS = ["wrap_openai", "wrap_anthropic", "@observe"] as const;

/** The three-line SDK setup and what it records (Figma "Illo/SDK"). */
export function SdkIllustration() {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-3.5 rounded-tile bg-hero-card px-5 pt-4 pb-5 dark:border dark:border-border">
        <div className="flex items-center justify-between">
          <span className="flex gap-1.5">
            <span className="size-2 rounded-full bg-rail-tile" />
            <span className="size-2 rounded-full bg-rail-tile" />
            <span className="size-2 rounded-full bg-rail-tile" />
          </span>
          <span className="font-mono text-xs text-rail-subtle-foreground">app.py</span>
        </div>
        <pre className="flex flex-col gap-0.5 font-mono text-label leading-[1.5] text-rail-foreground">
          <code>
            <span className="text-rail-muted-foreground">import</span> spanlight
          </code>
          <code>
            spanlight.<span className="text-lime">init</span>()
          </code>
          <code className="whitespace-pre-wrap">
            client <span className="text-rail-muted-foreground">=</span> spanlight.
            <span className="text-lime">wrap_anthropic</span>(
            <span className="md:hidden">{"\n    "}</span>
            Anthropic())
          </code>
        </pre>
      </div>

      <div className="flex flex-col gap-2.5 rounded-input bg-surface-muted px-4 py-3.5">
        <span className="text-overline text-subtle-foreground uppercase">
          Captured on every call
        </span>
        <ul className="flex flex-wrap gap-1.5">
          {CAPTURED_FIELDS.map((field) => (
            <li
              key={field}
              className="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-2xs leading-[1.5] text-muted-foreground"
            >
              {field}
            </li>
          ))}
        </ul>
      </div>

      <ul className="flex flex-wrap gap-2">
        {SDK_HELPERS.map((helper) => (
          <li
            key={helper}
            className="rounded-full bg-accent-subtle px-2.5 py-1 text-xs font-semibold text-accent"
          >
            {helper}
          </li>
        ))}
      </ul>
    </div>
  );
}
