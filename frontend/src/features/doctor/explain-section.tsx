import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useEffect, useId } from "react";

import { Callout } from "@/components/callout";
import { ReadOnlyLine } from "@/components/read-only-line";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission, useProjectParams } from "@/features/shell";
import type { Explanation } from "@/lib/api";
import { useNow } from "@/lib/use-now";

import { useExplainInsight } from "./doctor-queries";
import { ExplainButton } from "./explain-button";
import { explainControl, explainNotice, type ExplainNotice } from "./explain-state";
import { ExplanationView } from "./explanation-view";

const IDLE_HINT =
  "Uses your Anthropic credential and counts toward the monthly explanation budget.";
const LOADING_STATUS = "Reading the evidence and the example traces…";

interface ExplainSectionProps {
  insightId: string;
  /** Stored explanations, newest first. */
  explanations: readonly Explanation[];
  canManage: boolean;
}

/**
 * Figma "Explain with Claude": a button that asks for an advisory explanation, the stored ones
 * under it (each beneath its advisory label), and the reason when asking is not possible.
 */
export function ExplainSection({ insightId, explanations, canManage }: ExplainSectionProps) {
  const explain = useExplainInsight(insightId);
  const now = useNow();
  const hintId = useId();
  const notice = explain.isError ? explainNotice(explain.error) : null;
  const control = explainControl({
    canManage,
    pending: explain.isPending,
    notice,
    hasResult: explanations.length > 0,
  });
  const hasHint = control.reason !== null || notice?.blocks === true;
  const blocked = notice?.blocks === true;
  const { reset } = explain;

  // A blocking refusal (no credential, budget spent, unpriced model) can be fixed elsewhere, in
  // another tab: coming back to this one unlocks the button for another try.
  useEffect(() => {
    if (!blocked) {
      return;
    }
    window.addEventListener("focus", reset);
    return () => {
      window.removeEventListener("focus", reset);
    };
  }, [blocked, reset]);

  return (
    <Card role="region" aria-label="Explain with Claude" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent"
          >
            <Sparkles className="size-5" strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 className="text-card">Explain with Claude</h2>
            <p className="text-xs font-medium text-muted-foreground">
              Likely cause and a fix, from the evidence above.
            </p>
          </div>
        </div>
        <div className="max-sm:[&_button]:w-full">
          <ExplainButton
            control={control}
            describedBy={hasHint ? hintId : undefined}
            onClick={() => {
              explain.mutate();
            }}
          />
        </div>
      </div>
      <div role="status" aria-live="polite">
        {explain.isPending ? <PendingBody /> : null}
        {explain.isSuccess ? <p className="sr-only">Explanation ready.</p> : null}
      </div>
      <div id={hintId}>
        {control.reason === null ? null : <ReadOnlyLine size="md">{control.reason}</ReadOnlyLine>}
        {notice === null ? null : <NoticeView notice={notice} />}
      </div>
      {canManage && notice === null && !explain.isPending && explanations.length === 0 ? (
        <p className="text-xs font-medium text-muted-foreground">{IDLE_HINT}</p>
      ) : null}
      {explanations.length === 0 ? null : (
        <ul aria-label="Explanations" className="flex flex-col gap-5">
          {explanations.map((explanation, index) => (
            <li
              key={explanation.id}
              className={index === 0 ? undefined : "border-t border-border pt-5"}
            >
              <ExplanationView explanation={explanation} now={now} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The status line and the outlined placeholder lines while Claude answers. */
function PendingBody() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-muted-foreground">{LOADING_STATUS}</p>
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-3 w-1/2 rounded-full" />
      </div>
    </div>
  );
}

/** Credentials are owner-only, so an admin is told whom to ask instead of getting the link. */
const ASK_OWNER = "Ask an org owner to add it.";

function NoticeView({ notice }: { notice: ExplainNotice }) {
  const { orgId, projectId } = useProjectParams();
  const canAddCredential = usePermission("credentials:manage");
  return (
    <Callout
      tone={notice.tone}
      role={notice.tone === "danger" ? "alert" : "status"}
      action={
        notice.credentialsLink && canAddCredential ? (
          <Link
            to="/$orgId/$projectId/gateway/credentials"
            params={{ orgId, projectId }}
            className="rounded-sm text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            Open Credentials
          </Link>
        ) : undefined
      }
    >
      {notice.message}
      {notice.credentialsLink && !canAddCredential ? ` ${ASK_OWNER}` : null}
    </Callout>
  );
}
