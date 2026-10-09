import { CopyButton } from "@/components/copy-button";

import { gatewayBaseUrl } from "./gateway-url";

/** The Base URL pill of the page header (Figma "Gateway/Page header"), with a copy button. */
export function GatewayBaseUrl() {
  const url = gatewayBaseUrl();
  return (
    <div className="flex max-w-full items-center gap-2.5 rounded-full border border-border bg-surface py-1.5 pr-1.5 pl-4 shadow-card">
      <span className="text-xs font-medium text-subtle-foreground">Base URL</span>
      <code className="min-w-0 truncate font-mono text-[13px] text-foreground">{url}</code>
      <CopyButton value={url} label="Copy" showLabel className="shrink-0 bg-surface-muted" />
    </div>
  );
}
