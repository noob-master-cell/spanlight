import { ChartGantt, Coins, MessagesSquare, Network, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { MeshBackdrop } from "@/components/mesh-backdrop";
import { cn } from "@/lib/utils";

/**
 * Right half of the desktop auth split screen (Figma "Auth/Showcase panel"): what the product
 * does, as four capability tiles. Real capabilities only: no metrics, testimonials or logos.
 */
export function AuthShowcase({ className }: { className?: string }) {
  return (
    <aside
      aria-labelledby="auth-showcase-title"
      className={cn(
        "relative flex-col justify-between gap-10 overflow-hidden rounded-card bg-hero-card p-10 text-hero-card-foreground xl:p-14 dark:border dark:border-border",
        className,
      )}
    >
      <MeshBackdrop intensity="soft" className="-top-[290px] right-auto left-[250px]" />

      <div className="relative flex max-w-[460px] flex-col gap-3.5">
        <p className="text-overline text-rail-muted-foreground uppercase">LLM observability</p>
        <h2 id="auth-showcase-title" className="text-h1 text-rail-foreground">
          Every LLM call, accounted for.
        </h2>
        <p className="text-sm text-rail-muted-foreground">
          Traces, tokens, cost and errors for every request, from the Python SDK, the OpenAI and
          Anthropic wrappers, or any OpenTelemetry exporter.
        </p>
      </div>

      <ul className="relative flex flex-col gap-3">
        <li className="flex flex-col gap-6 rounded-tile bg-rail-tile p-6 xl:flex-row xl:items-center">
          <Capability icon={ChartGantt} title="Trace explorer" className="xl:w-[244px] xl:shrink-0">
            See each request as a span waterfall: LLM calls, tools and retrieval, with inputs,
            outputs and errors.
          </Capability>
          <WaterfallIllustration />
        </li>
        <li className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-tile bg-rail-tile p-6">
            <Capability icon={Coins} title="Cost & tokens">
              Input, output and cached tokens priced per model. Unknown prices show as —, never $0.
            </Capability>
          </div>
          <div className="rounded-tile bg-rail-tile p-6">
            <Capability icon={MessagesSquare} title="Sessions">
              Group traces into conversations and replay each turn with its cost and latency.
            </Capability>
          </div>
        </li>
        <li className="flex flex-col gap-6 rounded-tile bg-rail-tile p-6 xl:flex-row xl:items-center">
          <Capability icon={Network} title="OpenTelemetry" className="xl:w-[244px] xl:shrink-0">
            Point any OTLP/HTTP exporter at your project. gen_ai.* spans become LLM calls.
          </Capability>
          <ul aria-label="Supported integrations" className="flex flex-1 flex-wrap gap-2">
            <IntegrationChip>Python SDK</IntegrationChip>
            <IntegrationChip>OpenAI</IntegrationChip>
            <IntegrationChip>Anthropic</IntegrationChip>
            <IntegrationChip mono>OTLP/HTTP</IntegrationChip>
            <IntegrationChip mono>gen_ai.*</IntegrationChip>
          </ul>
        </li>
      </ul>
    </aside>
  );
}

interface CapabilityProps {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  className?: string;
}

/** Figma "Auth/Capability": lime icon tile, title, one-line description. */
function Capability({ icon: Icon, title, children, className }: CapabilityProps) {
  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-md bg-lime text-lime-foreground"
      >
        <Icon className="size-[18px]" strokeWidth={2} />
      </span>
      <div className="flex flex-col gap-1">
        <h3 className="text-card text-rail-foreground">{title}</h3>
        <p className="text-sm text-rail-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function IntegrationChip({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <li
      className={cn(
        "rounded-full border border-rail-tile bg-rail-tile px-3 py-1.5 text-rail-foreground",
        mono ? "font-mono text-label" : "text-xs font-medium",
      )}
    >
      {children}
    </li>
  );
}

/** Example spans, purely illustrative: bar offsets and widths are percentages of the track. */
const EXAMPLE_SPANS = [
  { name: "answer_ticket", barClass: "bg-kind-chain", offset: "0%", width: "80%" },
  { name: "retrieve_context", barClass: "bg-kind-retrieval", offset: "3%", width: "23%" },
  { name: "lookup_order", barClass: "bg-kind-tool", offset: "27%", width: "13%" },
  { name: "claude-sonnet-4-5", barClass: "bg-kind-llm", offset: "41%", width: "39%" },
] as const;

function WaterfallIllustration() {
  return (
    <div aria-hidden className="flex min-w-0 flex-1 flex-col gap-3">
      {EXAMPLE_SPANS.map((span) => (
        <div key={span.name} className="flex items-center gap-2.5">
          <span className="w-[140px] shrink-0 truncate font-mono text-label text-rail-muted-foreground">
            {span.name}
          </span>
          <span className="relative h-2 min-w-0 flex-1 rounded-[4px] bg-rail-tile">
            <span
              className={cn("absolute inset-y-0 rounded-[4px]", span.barClass)}
              style={{ left: span.offset, width: span.width }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}
