import { cn } from "@/lib/utils";

const KIND_DOT = {
  llm: "bg-kind-llm",
  tool: "bg-kind-tool",
  retrieval: "bg-kind-retrieval",
  chain: "bg-kind-chain",
} as const;

type SpanKind = keyof typeof KIND_DOT;

interface ExampleSpan {
  name: string;
  kind: SpanKind;
  /** Bar start and end as percentages of the track. */
  start: number;
  end: number;
  duration: string;
  /** Time-to-first-token marker, as a percentage of the track. */
  ttft?: number;
  root?: boolean;
}

const SPANS: readonly ExampleSpan[] = [
  { name: "answer_ticket", kind: "chain", start: 0, end: 84.58, duration: "1.96 s", root: true },
  { name: "classify_intent", kind: "llm", start: 0.86, end: 15.53, duration: "340 ms" },
  { name: "search_kb", kind: "retrieval", start: 16.4, end: 25.03, duration: "200 ms" },
  { name: "lookup_order", kind: "tool", start: 17.26, end: 28.48, duration: "260 ms" },
  { name: "generate_reply", kind: "llm", start: 30.21, end: 81.12, duration: "1.18 s", ttft: 47.9 },
  { name: "update_ticket", kind: "tool", start: 81.55, end: 84.14, duration: "60 ms" },
];

const AXIS = ["0", "0.5 s", "1.0 s", "1.5 s", "2.0 s"] as const;

const LEGEND: readonly { label: string; kind: SpanKind }[] = [
  { label: "LLM", kind: "llm" },
  { label: "Tool", kind: "tool" },
  { label: "Retrieval", kind: "retrieval" },
  { label: "Chain", kind: "chain" },
];

/** A trace as a span waterfall (Figma "Illo/Waterfall"). Phones drop the axis and durations. */
export function WaterfallIllustration() {
  return (
    <div className="flex flex-col gap-2.5 rounded-tile bg-rail-tile p-[18px]">
      <div className="flex items-center justify-between pb-1">
        <span className="flex items-center gap-2 font-mono text-label font-medium text-rail-foreground">
          <span className="size-2 rounded-full bg-success" />
          answer_ticket
        </span>
        <span className="flex items-center gap-2.5">
          <span className="rounded-full bg-lime px-2.5 py-1 text-xs font-bold text-lime-foreground">
            TTFT 410 ms
          </span>
          <span className="hidden font-mono text-xs text-rail-muted-foreground md:inline">
            1.96 s · $0.0182
          </span>
        </span>
      </div>

      <div className="hidden items-start gap-3 md:flex">
        <span className="w-[150px] shrink-0" />
        <span className="flex flex-1 justify-between text-2xs leading-[1.4] font-medium text-rail-subtle-foreground">
          {AXIS.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </span>
        <span className="w-12 shrink-0" />
      </div>

      {SPANS.map((span) => (
        <div key={span.name} className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-[22px] w-[150px] shrink-0 items-center gap-2 font-mono text-xs",
              span.root ? "text-rail-foreground" : "pl-3.5 text-rail-muted-foreground",
            )}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", KIND_DOT[span.kind])} />
            <span className="truncate">{span.name}</span>
          </span>
          <span className="relative h-[22px] min-w-0 flex-1 overflow-hidden rounded-[7px] bg-rail-tile">
            <span
              className={cn(
                "absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full",
                KIND_DOT[span.kind],
              )}
              style={{ left: `${span.start}%`, right: `${100 - span.end}%` }}
            />
            {span.ttft === undefined ? null : (
              <span
                className="absolute inset-y-0 w-0.5 bg-lime"
                style={{ left: `${span.ttft}%` }}
              />
            )}
          </span>
          <span className="hidden w-12 shrink-0 text-right font-mono text-xs text-rail-subtle-foreground md:inline">
            {span.duration}
          </span>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1.5 text-xs font-medium text-rail-muted-foreground">
        {LEGEND.map((item) => (
          <span key={item.kind} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", KIND_DOT[item.kind])} />
            {item.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-[3px] rounded-[2px] bg-lime" />
          Time to first token
        </span>
      </div>
    </div>
  );
}
