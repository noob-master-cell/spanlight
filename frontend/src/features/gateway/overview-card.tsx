import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProjectParams } from "@/features/shell";
import { formatInteger } from "@/lib/format";

import { formatErrorShare, NO_REQUESTS_REASON } from "./overview-format";

interface OverviewCardProps {
  title: string;
  description: string;
  /** The page the header link opens, e.g. Routes for the target table. */
  link: {
    to: "/$orgId/$projectId/gateway/routes" | "/$orgId/$projectId/gateway/keys";
    label: string;
  };
  children: ReactNode;
}

/** A card with a title, a one-line description and a link to the page that edits its subject. */
export function OverviewCard({ title, description, link, children }: OverviewCardProps) {
  const { orgId, projectId } = useProjectParams();
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Link
          to={link.to}
          params={{ orgId, projectId }}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          {link.label}
          <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="px-0 pb-2 sm:px-3">{children}</CardContent>
    </Card>
  );
}

/** Inline line of a table with no rows in a quiet window. */
export function QuietWindowNote() {
  return <p className="px-6 pb-4 text-sm text-muted-foreground">{NO_REQUESTS_REASON}</p>;
}

/** The error count in the danger colour with its share of the requests beside it. */
export function ErrorCount({ errors, requests }: { errors: number; requests: number }) {
  if (errors === 0) {
    return <span className="text-muted-foreground tabular">0</span>;
  }
  const share = formatErrorShare(errors, requests);
  return (
    <span className="tabular">
      <span className="font-semibold text-danger-text">{formatInteger(errors)}</span>
      {share ? <span className="ml-2 text-xs text-muted-foreground">{share}</span> : null}
    </span>
  );
}
