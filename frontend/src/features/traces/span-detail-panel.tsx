import { CircleAlert } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { JsonViewer } from "@/components/json-viewer";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Span } from "@/lib/api";
import { formatDuration, formatInteger, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

import { payloadToClipboardText } from "./chat-messages";
import { MetaField } from "./meta-field";
import { PayloadView } from "./payload-view";
import { SpanKindBadge } from "./span-kind";
import { SpanStatusBadge } from "./status";
import { TruncatedBadge } from "./truncated-badge";

const SPAN_DETAIL_TABS = ["io", "metadata", "raw"] as const;
export type SpanDetailTab = (typeof SPAN_DETAIL_TABS)[number];

function isSpanDetailTab(value: string): value is SpanDetailTab {
  return (SPAN_DETAIL_TABS as readonly string[]).includes(value);
}

/** Figma "Traces/Pill tab": equal-width pills on a surface-muted track. */
const TAB_TRIGGER = "h-[34px] min-w-0 flex-1 px-3.5";

interface SpanDetailPanelProps {
  span: Span;
  /** The open tab, kept by the page so it survives selecting another span. */
  tab: SpanDetailTab;
  onTabChange: (tab: SpanDetailTab) => void;
  className?: string;
}

/** Figma "Span detail": header, then Input / Output, Metadata and Raw JSON tabs. */
export function SpanDetailPanel({ span, tab, onTabChange, className }: SpanDetailPanelProps) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-4 p-5 sm:p-6", className)}>
      <section aria-label={`Span ${span.name}`} className="flex min-w-0 flex-col gap-4">
        <SpanDetailHeader span={span} />
        <Tabs
          value={tab}
          onValueChange={(next) => {
            if (isSpanDetailTab(next)) {
              onTabChange(next);
            }
          }}
          className="flex min-w-0 flex-col"
        >
          <TabsList aria-label="Span details" className="flex w-full gap-1 border-0">
            <TabsTrigger value="io" className={TAB_TRIGGER}>
              Input / Output
            </TabsTrigger>
            <TabsTrigger value="metadata" className={TAB_TRIGGER}>
              Metadata
            </TabsTrigger>
            <TabsTrigger value="raw" className={TAB_TRIGGER}>
              Raw JSON
            </TabsTrigger>
          </TabsList>
          <TabsContent value="io" className="flex flex-col gap-2.5">
            <PayloadView label="Input" value={span.input} spanTruncated={span.truncated} />
            <PayloadView label="Output" value={span.output} spanTruncated={span.truncated} />
          </TabsContent>
          <TabsContent value="metadata">
            <SpanMetadata span={span} />
          </TabsContent>
          <TabsContent value="raw" className="flex flex-col gap-2">
            <div className="flex justify-end">
              <CopyButton value={payloadToClipboardText(span)} label="Copy span JSON" showLabel />
            </div>
            <JsonViewer value={span} defaultExpandDepth={1} className="rounded-input px-3 py-3.5" />
          </TabsContent>
        </Tabs>
      </section>
    </Card>
  );
}

function SpanDetailHeader({ span }: { span: Span }) {
  return (
    <header className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <h2 title={span.name} className="min-w-0 flex-1 truncate text-card text-foreground">
          {span.name}
        </h2>
        <CopyButton value={span.span_id} label="Copy span ID" className="size-7 shrink-0" />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <SpanKindBadge kind={span.kind} />
        <SpanStatusBadge status={span.status} />
        {span.truncated ? <TruncatedBadge /> : null}
        <span className="tabular">{formatDuration(span.duration_ms)}</span>
        {span.model ? (
          <>
            <span aria-hidden className="text-subtle-foreground">
              ·
            </span>
            <span title={span.model} className="max-w-56 truncate font-mono text-label font-normal">
              {span.model}
            </span>
          </>
        ) : null}
      </div>
      {span.status === "error" ? (
        <div
          role="note"
          className="mt-1 flex items-start gap-2 rounded-input bg-danger-subtle px-3 py-2.5 text-danger-text"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0 font-mono text-xs leading-5 break-words whitespace-pre-wrap">
            {span.status_message ?? "The span failed without an error message."}
          </p>
        </div>
      ) : null}
    </header>
  );
}

/** Figma "Panel / Metadata": timing and IDs, then the custom attributes as JSON. */
function SpanMetadata({ span }: { span: Span }) {
  const attributeCount = Object.keys(span.attributes).length;

  return (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-col">
        <MetaField layout="inline" label="Started">
          <span className="tabular">{formatTimestamp(span.started_at)}</span>
        </MetaField>
        <MetaField layout="inline" label="Ended">
          <span className="tabular">{formatTimestamp(span.ended_at)}</span>
        </MetaField>
        <MetaField layout="inline" label="Duration">
          <span className="tabular">{formatDuration(span.duration_ms)}</span>
        </MetaField>
        <MetaField
          layout="inline"
          label="Span ID"
          mono
          copyValue={span.span_id}
          copyLabel="Copy span ID"
        >
          {span.span_id}
        </MetaField>
        {span.parent_span_id ? (
          <MetaField
            layout="inline"
            label="Parent span ID"
            mono
            copyValue={span.parent_span_id}
            copyLabel="Copy parent span ID"
          >
            {span.parent_span_id}
          </MetaField>
        ) : (
          <MetaField layout="inline" label="Parent span ID">
            <span className="text-muted-foreground">None (root span)</span>
          </MetaField>
        )}
      </dl>

      <section aria-label="Attributes" className="flex flex-col gap-2">
        <div className="flex h-7 items-center gap-1.5">
          <h3 className="text-sm font-medium text-foreground">Attributes</h3>
          <span className="text-xs font-medium text-subtle-foreground tabular">
            {formatInteger(attributeCount)}
          </span>
          {attributeCount > 0 ? (
            <CopyButton
              value={payloadToClipboardText(span.attributes)}
              label="Copy attributes"
              className="ml-auto size-7"
            />
          ) : null}
        </div>
        {attributeCount === 0 ? (
          <p className="text-sm text-muted-foreground">No custom attributes on this span.</p>
        ) : (
          <JsonViewer
            value={span.attributes}
            defaultExpandDepth={3}
            className="rounded-input px-3 py-3.5"
          />
        )}
      </section>
    </div>
  );
}

export function SpanDetailSkeleton({ className }: { className?: string }) {
  return (
    <Card aria-hidden className={cn("flex flex-col gap-4 p-5 sm:p-6", className)}>
      <Skeleton className="h-5 w-48" />
      <div className="flex gap-1.5">
        <Skeleton className="h-6 w-11 rounded-full" />
        <Skeleton className="h-6 w-10 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <Skeleton className="h-[42px] w-full rounded-full" />
      <Skeleton className="h-20 w-[88%] self-center rounded-tile" />
      <Skeleton className="h-28 w-[85%] self-end rounded-tile" />
      <Skeleton className="h-36 w-[85%] rounded-tile" />
    </Card>
  );
}
