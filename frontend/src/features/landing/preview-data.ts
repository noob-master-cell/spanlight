/**
 * Illustrative values for the hero's product preview (Figma "App screen — Overview
 * (preview)"). This is a marketing illustration of the Overview page, drawn with the app's
 * tokens; it is not live or customer data, and the preview is hidden from assistive tech.
 */

export const PREVIEW_PROJECT = "Support Copilot";

export const PREVIEW_NAV = ["Overview", "Traces", "Sessions", "Settings"] as const;

export const PREVIEW_TIME_RANGES = ["1h", "24h", "7d", "30d"] as const;

export const PREVIEW_SPEND = {
  dollars: "$184",
  cents: ".27",
  change: "−12.4%",
  projection: "Projected $5.4k this month",
  /** Hourly bar heights in px at the preview's native 1440px width; one is highlighted. */
  hourlyBars: [53, 72, 60, 93, 83, 105, 87, 123, 150, 99, 78, 66],
  highlightedBar: 8,
  topModels: [
    { label: "Sonnet 4.5", value: "$112" },
    { label: "4.1-mini", value: "$41" },
    { label: "Haiku 4.5", value: "$25" },
  ],
} as const;

export const PREVIEW_KPIS = {
  latency: { label: "p95 latency", value: "1.84s", change: "+220 ms" },
  errorRate: { label: "Error rate", value: "0.42%", change: "−0.1 pt" },
  tokens: { label: "Tokens", value: "31.6M", detail: "22.1M in · 9.5M out" },
} as const;

export const PREVIEW_CALLS = { calls: "48.2k calls", errors: "203 errors" } as const;

export interface PreviewTrace {
  name: string;
  model: string;
  duration: string;
  tokens: string;
  cost: string;
  age: string;
  failed: boolean;
}

export const PREVIEW_TRACES: readonly PreviewTrace[] = [
  {
    name: "answer_ticket",
    model: "claude-sonnet-4-5",
    duration: "1.96 s",
    tokens: "3,134 tok",
    cost: "$0.0182",
    age: "12s",
    failed: false,
  },
  {
    name: "classify_intent",
    model: "gpt-4.1-mini",
    duration: "30.0 s",
    tokens: "—",
    cost: "—",
    age: "1m",
    failed: true,
  },
  {
    name: "summarize_thread",
    model: "claude-haiku-4-5",
    duration: "640 ms",
    tokens: "920 tok",
    cost: "$0.0018",
    age: "3m",
    failed: false,
  },
];

/** Floating chips around the browser frame. */
export const PREVIEW_CHIPS = {
  live: "Live · receiving traces",
  latency: { label: "p95 latency", value: "1.84s" },
  costPerTrace: { label: "Cost per trace", value: "$0.0182" },
} as const;
