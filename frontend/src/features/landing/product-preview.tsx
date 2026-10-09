import { Clock, DollarSign, Lock } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { APP_PREVIEW_HEIGHT, APP_PREVIEW_WIDTH, AppPreview } from "./app-preview";
import { MeshBlob } from "./mesh-blob";
import { PREVIEW_CHIPS } from "./preview-data";
import { useFitScale } from "./use-fit-scale";

/**
 * The hero's product shot (Figma "Product preview"): a browser frame around a scaled-down
 * Overview screen, floating metric chips and a pastel glow. It is an illustration, so the
 * whole composition is hidden from assistive tech and contains nothing focusable.
 */
export function ProductPreview({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative pb-[30px] select-none lg:pb-16", className)}>
      <MeshBlob
        tone="lavender"
        className="top-[60px] left-[-10px] h-[220px] w-[360px] blur-[45px] lg:top-[160px] lg:left-[calc(50%-520px)] lg:h-[460px] lg:w-[1040px] lg:blur-[80px]"
      />
      <MeshBlob
        tone="sky"
        className="top-[160px] left-[150px] h-[160px] w-[240px] blur-[45px] lg:top-[480px] lg:left-[calc(50%+40px)] lg:h-[340px] lg:w-[640px] lg:blur-[75px]"
      />
      <MeshBlob
        tone="butter"
        className="hidden lg:top-[500px] lg:left-[calc(50%-560px)] lg:block lg:h-[320px] lg:w-[560px] lg:blur-[75px]"
      />

      <div className="relative mx-auto max-w-[1203px]">
        <BrowserFrame />

        <FloatingChip className="top-[-16px] right-2.5 rounded-full py-[7px] pr-3 pl-[9px] lg:top-[-24px] lg:right-[5.6%] lg:py-3 lg:pr-[18px] lg:pl-3.5">
          <span className="flex size-4 items-center justify-center rounded-full bg-success-subtle lg:size-5">
            <span className="size-1.5 animate-live-pulse rounded-full bg-success text-success lg:size-2" />
          </span>
          <span className="text-xs font-semibold text-foreground lg:text-sm">
            {PREVIEW_CHIPS.live}
          </span>
        </FloatingChip>

        <FloatingChip className="top-[88%] left-[-10px] rounded-2xl py-2 pr-3.5 pl-2 lg:top-[53.4%] lg:left-[-40px] lg:rounded-[22px] lg:py-3 lg:pr-[22px] lg:pl-3 xl:left-[-92px]">
          <ChipIcon className="bg-accent-subtle text-accent">
            <Clock />
          </ChipIcon>
          <ChipValue label={PREVIEW_CHIPS.latency.label} value={PREVIEW_CHIPS.latency.value} />
        </FloatingChip>

        <FloatingChip className="top-[80.7%] right-[-40px] hidden rounded-[22px] py-3 pr-[22px] pl-3 lg:flex xl:right-[-89px]">
          <ChipIcon className="bg-lime text-lime-foreground">
            <DollarSign />
          </ChipIcon>
          <ChipValue
            label={PREVIEW_CHIPS.costPerTrace.label}
            value={PREVIEW_CHIPS.costPerTrace.value}
          />
        </FloatingChip>
      </div>
    </div>
  );
}

function BrowserFrame() {
  return (
    <div className="flex flex-col gap-1.5 rounded-[20px] border border-surface bg-surface p-1.5 shadow-lg backdrop-blur-[10px] lg:gap-2 lg:rounded-[32px] lg:border-[1.5px] lg:p-2.5 dark:border-border">
      <div className="flex h-5 items-center justify-between px-1.5 lg:h-9 lg:px-2.5">
        <span className="flex w-[60px] gap-1 lg:w-[120px] lg:gap-[7px]">
          <span className="size-[7px] rounded-full bg-border-strong lg:size-[11px]" />
          <span className="size-[7px] rounded-full bg-border-strong lg:size-[11px]" />
          <span className="size-[7px] rounded-full bg-border-strong lg:size-[11px]" />
        </span>
        <span className="flex items-center gap-1 rounded-full bg-background px-2.5 py-[3px] font-mono text-[9px] text-muted-foreground lg:gap-2 lg:border lg:border-border lg:px-4 lg:py-1.5 lg:text-xs">
          <Lock className="size-2 text-subtle-foreground lg:size-3" />
          <span>
            localhost:8080<span className="hidden lg:inline">/overview</span>
          </span>
        </span>
        <span className="w-[60px] lg:w-[120px]" />
      </div>
      <ScaledScreen />
    </div>
  );
}

/** The 1440×900 app screen, scaled to the frame's width. */
function ScaledScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale(containerRef, APP_PREVIEW_WIDTH);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-[14px] bg-canvas lg:rounded-[22px]"
      style={{ aspectRatio: `${APP_PREVIEW_WIDTH} / ${APP_PREVIEW_HEIGHT}` }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `scale(${scale})`, visibility: scale > 0 ? "visible" : "hidden" }}
      >
        <AppPreview />
      </div>
    </div>
  );
}

function FloatingChip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "absolute flex items-center gap-2 border border-surface bg-surface shadow-lg backdrop-blur-[12px] lg:gap-3 dark:border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ChipIcon({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-[30px] shrink-0 items-center justify-center rounded-[10px] lg:size-11 lg:rounded-[14px]",
        "[&_svg]:size-[15px] lg:[&_svg]:size-5",
        className,
      )}
    >
      {children}
    </span>
  );
}

function ChipValue({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col whitespace-nowrap">
      <span className="text-2xs leading-[1.4] font-medium text-muted-foreground lg:text-xs">
        {label}
      </span>
      <span className="text-base leading-[1.4] font-extrabold tracking-[-0.01em] text-foreground lg:text-h2 lg:font-extrabold">
        {value}
      </span>
    </span>
  );
}
