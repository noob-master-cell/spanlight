import type { ReactNode } from "react";

import { PageHeader } from "@/components/page-header";

import { GatewayBaseUrl } from "./gateway-base-url";
import { GatewayNav } from "./gateway-nav";

interface GatewayLayoutProps {
  children: ReactNode;
}

/**
 * The frame every gateway page renders inside (Figma "Gateway/Page header" and "Gateway/Sub-nav"):
 * the shared title, the Base URL pill, the sub-navigation, then the page's own content. Pages put
 * their actions inside their content, not in the header.
 */
export function GatewayLayout({ children }: GatewayLayoutProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Gateway"
        description="One endpoint for your OpenAI and Anthropic calls, with keys, limits, caching and fallbacks."
        actions={<GatewayBaseUrl />}
      />
      <GatewayNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
