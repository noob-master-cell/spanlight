import { ChevronDown, ChevronsUpDown, Search, Sun } from "lucide-react";
import { useId } from "react";

import { Logo } from "@/components/logo";
import { MeshBackdrop } from "@/components/mesh-backdrop";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  PREVIEW_CALLS,
  PREVIEW_KPIS,
  PREVIEW_NAV,
  PREVIEW_PROJECT,
  PREVIEW_SPEND,
  PREVIEW_TIME_RANGES,
  PREVIEW_TRACES,
  type PreviewTrace,
} from "./preview-data";

/** The preview is drawn at the app's real desktop size and scaled down to fit. */
export const APP_PREVIEW_WIDTH = 1440;
export const APP_PREVIEW_HEIGHT = 900;

/**
 * A static picture of the Overview page (Figma "App screen — Overview (preview)") at 1440×900,
 * built from the same tokens as the app. Decorative: nothing in it is interactive or focusable.
 */
export function AppPreview() {
  return (
    <div
      className="flex gap-3 bg-canvas p-3"
      style={{ width: APP_PREVIEW_WIDTH, height: APP_PREVIEW_HEIGHT }}
    >
      <PreviewRail />
      <div className="relative flex min-w-0 flex-1 flex-col gap-8 overflow-hidden rounded-card bg-background px-10 pt-7 pb-10">
        <MeshBackdrop className="top-0 right-auto left-[420px]" />
        <PreviewTopbar />
        <div className="relative flex flex-col gap-7">
          <div className="flex items-end justify-between">
            <p className="w-[640px] text-display text-foreground">
              Good afternoon. Your models are{" "}
              <span className="font-serif-accent text-serif text-accent">behaving.</span>
            </p>
            <div className="flex gap-2">
              <span className={buttonVariants({ variant: "secondary" })}>Export</span>
              <span className={buttonVariants({ variant: "primary" })}>Explore traces</span>
            </div>
          </div>
          <div className="flex gap-4">
            <SpendCard />
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <CallsCard />
              <KpiRow />
            </div>
          </div>
          <LatestTraces />
        </div>
      </div>
    </div>
  );
}

function PreviewRail() {
  return (
    <div className="flex w-[240px] shrink-0 flex-col gap-5 rounded-card bg-rail px-4 pt-5 pb-4">
      <Logo tone="on-dark" className="self-start" />

      <div className="flex flex-col gap-0.5 rounded-2xl bg-rail-tile px-3.5 py-3">
        <span className="text-overline text-rail-subtle-foreground uppercase">Project</span>
        <span className="flex items-center justify-between text-sm font-semibold text-rail-foreground">
          {PREVIEW_PROJECT}
          <ChevronsUpDown className="size-3.5 text-rail-subtle-foreground" />
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {PREVIEW_NAV.map((item, index) =>
          index === 0 ? (
            <span
              key={item}
              className="flex h-11 items-center justify-between rounded-2xl bg-lime px-4 text-sm font-bold text-lime-foreground"
            >
              {item}
              <span className="size-1.5 rounded-full bg-lime-foreground" />
            </span>
          ) : (
            <span
              key={item}
              className="flex h-11 items-center px-4 text-sm font-medium text-rail-muted-foreground"
            >
              {item}
            </span>
          ),
        )}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-1.5 rounded-[20px] bg-rail-tile p-4">
        <span className="text-sm font-semibold text-rail-foreground">Connect your app</span>
        <span className="text-xs font-medium text-rail-subtle-foreground">
          Python SDK, OpenAI, Anthropic or OTLP.
        </span>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-rail-tile px-3 py-2.5">
        <span className="size-9 shrink-0 rounded-full bg-linear-to-r from-avatar-from to-avatar-to" />
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-rail-foreground">Demo viewer</span>
          <span className="text-xs font-medium text-rail-subtle-foreground">
            Read-only · Live demo
          </span>
        </span>
      </div>
    </div>
  );
}

const PILL = "rounded-full border border-border bg-surface shadow-card";

function PreviewTopbar() {
  return (
    <div className="relative flex h-11 items-center justify-between">
      <div className={cn(PILL, "flex h-10 w-[320px] items-center gap-2.5 pr-2 pl-4")}>
        <Search className="size-4 text-subtle-foreground" />
        <span className="flex-1 text-sm text-subtle-foreground">Search traces, models, users…</span>
        <span className="rounded-[6px] bg-surface-muted px-1.5 py-0.5 font-mono text-2xs font-medium text-muted-foreground">
          ⌘K
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className={cn(PILL, "flex gap-0.5 p-1")}>
          {PREVIEW_TIME_RANGES.map((range) => (
            <span
              key={range}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm",
                range === "24h"
                  ? "bg-ink font-semibold text-ink-foreground"
                  : "font-medium text-muted-foreground",
              )}
            >
              {range}
            </span>
          ))}
        </div>
        <div className={cn(PILL, "flex items-center gap-2 py-2.5 pr-3 pl-3.5")}>
          <span className="size-2 rounded-full bg-success" />
          <span className="text-sm font-medium text-foreground">production</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </div>
        <div className={cn(PILL, "flex size-10 items-center justify-center")}>
          <Sun className="size-[18px] text-foreground" />
        </div>
      </div>
    </div>
  );
}

function SpendCard() {
  return (
    <div className="flex w-[440px] shrink-0 flex-col rounded-card bg-hero-card p-7 dark:border dark:border-border">
      <div className="flex items-center justify-between">
        <span className="text-sm text-rail-muted-foreground">Spend · last 24h</span>
        <span className="rounded-full bg-lime px-[11px] py-[5px] text-xs font-bold text-lime-foreground">
          {PREVIEW_SPEND.change}
        </span>
      </div>
      <div className="flex flex-col gap-2 pt-4">
        <span className="text-metric-xl text-rail-foreground">
          {PREVIEW_SPEND.dollars}
          <span className="text-rail-subtle-foreground">{PREVIEW_SPEND.cents}</span>
        </span>
        <span className="text-sm text-rail-subtle-foreground">{PREVIEW_SPEND.projection}</span>
      </div>
      <div className="flex items-end gap-1.5 pt-7">
        {PREVIEW_SPEND.hourlyBars.map((height, index) => (
          <span
            key={index}
            className={cn(
              "flex-1 rounded-t-lg",
              index === PREVIEW_SPEND.highlightedBar ? "bg-lime" : "bg-rail-tile",
            )}
            style={{ height }}
          />
        ))}
      </div>
      <div className="flex gap-2.5 pt-5">
        {PREVIEW_SPEND.topModels.map((model) => (
          <span
            key={model.label}
            className="flex flex-1 flex-col gap-1 rounded-xl bg-rail-tile px-3.5 py-3"
          >
            <span className="text-xs font-medium text-rail-subtle-foreground">{model.label}</span>
            <span className="text-card text-rail-foreground">{model.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const CARD = "rounded-card border border-border bg-surface shadow-card";

function CallsCard() {
  return (
    <div className={cn(CARD, "flex flex-col gap-3.5 px-6 pt-6 pb-5")}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-card text-foreground">Calls &amp; errors</span>
          <span className="text-xs font-medium text-muted-foreground">Hourly · last 24h</span>
        </div>
        <div className="flex gap-2">
          <Badge variant="accent">{PREVIEW_CALLS.calls}</Badge>
          <Badge variant="danger">{PREVIEW_CALLS.errors}</Badge>
        </div>
      </div>
      <CallsChart />
    </div>
  );
}

const GRID_LINES_Y = [15.98, 48.76, 81.53, 114.31];
const CALLS_PATH =
  "M0 91.78C29.5 85.22 52.44 62.28 81.94 67.19C111.44 72.11 126.19 98.33 155.69 77.03C185.19 55.72 199.94 31.14 237.64 39.33C275.33 47.53 288.44 75.39 319.58 60.64C350.72 45.89 370.39 16.39 399.89 26.22C429.39 36.06 452.33 52.44 475.28 37.69";
const ERRORS_PATH =
  "M0 122.92C59 121.28 88.5 115.54 126.19 119.64C163.89 123.74 206.5 111.44 244.19 117.18C281.89 122.92 326.14 107.35 362.19 115.54C398.25 123.74 437.58 120.46 475.28 118.82";

/** Calls (area) and errors (line) over 24 hours, traced from the Figma chart. */
function CallsChart() {
  const gradientId = `calls-fill-${useId().replace(/:/g, "")}`;
  return (
    <svg width="580" height="160" viewBox="0 0 475.28 131.11" fill="none" className="block">
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="24"
          x2="0"
          y2="131.11"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--chart-1)" stopOpacity="0.24" />
          <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {GRID_LINES_Y.map((y) => (
        <line
          key={y}
          x1="0"
          x2="475.28"
          y1={y}
          y2={y}
          stroke="var(--chart-grid)"
          strokeWidth="0.82"
          strokeDasharray="3.26 3.26"
        />
      ))}
      <path d={`${CALLS_PATH}V131.11H0Z`} fill={`url(#${gradientId})`} />
      <path d={CALLS_PATH} stroke="var(--chart-1)" strokeWidth="2.05" strokeLinecap="round" />
      <path d={ERRORS_PATH} stroke="var(--chart-2)" strokeWidth="2.05" strokeLinecap="round" />
    </svg>
  );
}

function KpiRow() {
  const { latency, errorRate, tokens } = PREVIEW_KPIS;
  return (
    <div className="flex items-start gap-4">
      <div className={cn(CARD, "flex flex-1 flex-col items-start gap-2.5 p-[22px]")}>
        <span className="text-sm text-muted-foreground">{latency.label}</span>
        <span className="text-metric text-foreground">{latency.value}</span>
        <Badge variant="danger">{latency.change}</Badge>
      </div>
      <div className={cn(CARD, "flex flex-1 flex-col items-start gap-2.5 p-[22px]")}>
        <span className="text-sm text-muted-foreground">{errorRate.label}</span>
        <span className="text-metric text-foreground">{errorRate.value}</span>
        <Badge variant="success">{errorRate.change}</Badge>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 rounded-card bg-linear-144 from-accent-card-from to-fuchsia to-70% p-[22px] text-accent-card-foreground">
        <span className="text-sm">{tokens.label}</span>
        <span className="text-metric">{tokens.value}</span>
        <span className="text-xs font-medium">{tokens.detail}</span>
      </div>
    </div>
  );
}

function LatestTraces() {
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-2">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-card text-foreground">Latest traces</span>
        <span className="text-sm font-semibold text-accent">View all</span>
      </div>
      {PREVIEW_TRACES.map((trace) => (
        <TraceRow key={trace.name} trace={trace} />
      ))}
    </div>
  );
}

function TraceRow({ trace }: { trace: PreviewTrace }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-[18px] py-3.5 text-sm text-foreground",
        trace.failed ? "bg-danger-subtle" : "bg-surface-muted",
      )}
    >
      <span className="flex w-[260px] shrink-0 items-center gap-2 font-semibold">
        <span className={cn("size-2 rounded-full", trace.failed ? "bg-danger" : "bg-success")} />
        {trace.name}
      </span>
      <span className="w-[230px] shrink-0 font-mono text-label text-muted-foreground">
        {trace.model}
      </span>
      <span className="w-[110px] shrink-0">{trace.duration}</span>
      <span className="w-[110px] shrink-0">{trace.tokens}</span>
      <span className="w-[110px] shrink-0 font-semibold">{trace.cost}</span>
      <span className="flex-1 text-right text-subtle-foreground">{trace.age}</span>
    </div>
  );
}
