const GEN_AI_ATTRIBUTES = [
  "gen_ai.system",
  "gen_ai.request.model",
  "gen_ai.usage.input_tokens",
  "gen_ai.usage.output_tokens",
] as const;

/** The OTLP endpoint and the gen_ai.* attributes it maps (Figma "Illo/OTel"). */
export function OtelIllustration() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-input bg-hero-card px-3 py-2.5 font-mono text-xs leading-[1.5] whitespace-nowrap dark:border dark:border-border">
        <span className="font-medium text-lime">POST</span>
        <span className="text-rail-foreground">/v1/otlp/traces</span>
      </div>
      <span className="text-overline text-subtle-foreground uppercase">
        Maps gen_ai.* attributes
      </span>
      {GEN_AI_ATTRIBUTES.map((attribute) => (
        <span
          key={attribute}
          className="truncate rounded-md bg-surface-muted px-2.5 py-2 font-mono text-xs leading-[1.5] text-foreground"
        >
          {attribute}
        </span>
      ))}
      <div className="flex gap-1.5 pt-1">
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          JSON
        </span>
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          protobuf
        </span>
      </div>
    </div>
  );
}
