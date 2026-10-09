import { EyeOff, Lock, ToggleRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

/** Tenant isolation, redaction and the payload-capture switch (Figma "Illo/Privacy"). */
export function PrivacyIllustration() {
  return (
    <div className="flex flex-col gap-2">
      <PrivacyRow
        icon={Lock}
        title="Row-level security"
        description="Postgres RLS scopes every query to its project."
        status={<Badge variant="success">Enforced</Badge>}
      />
      <PrivacyRow
        icon={EyeOff}
        title="Secret redaction"
        description="API keys, bearer tokens and card numbers are scrubbed on ingest."
        status={<Badge variant="accent">Automatic</Badge>}
      />
      <PrivacyRow
        icon={ToggleRight}
        title="Payload capture"
        description="Keep full prompts and completions, or metadata only."
        status={
          <span className="flex h-6 w-10 items-center justify-end rounded-full bg-lime p-[3px]">
            <span className="size-[18px] rounded-full bg-lime-foreground" />
          </span>
        }
      />
    </div>
  );
}

interface PrivacyRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  status: ReactNode;
}

function PrivacyRow({ icon: Icon, title, description, status }: PrivacyRowProps) {
  return (
    <div className="flex items-center gap-3.5 rounded-input bg-surface-muted px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-foreground">
        <Icon className="size-[18px]" strokeWidth={1.5} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-xs font-medium text-muted-foreground">{description}</span>
      </span>
      {status}
    </div>
  );
}
