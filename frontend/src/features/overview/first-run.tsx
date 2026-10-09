import { Link } from "@tanstack/react-router";
import { Activity, Check } from "lucide-react";
import { Fragment, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { StatusDot } from "@/components/status-dot";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/features/auth/queries";
import { useDemoSession } from "@/features/auth/use-demo-session";
import { buildSnippets, DEFAULT_ENVIRONMENT, type Snippet } from "@/features/onboarding/snippets";
import { useCurrentOrg, useProjectParams } from "@/features/shell/project-context";
import type { CodeTokenKind } from "@/lib/highlight";

import { EmptyKpiCards } from "./kpi-cards";
import { snippetLines } from "./snippet-lines";

/** The snippet tabs shown here; plain curl stays in the full onboarding flow. */
const SNIPPET_TABS = ["python", "openai", "anthropic", "otel"] as const;

interface FirstRunProps {
  projectName: string | null;
  environment: string | undefined;
}

/**
 * The project has never received a trace (Figma "Overview — First run"): a connect card with
 * the three setup steps and a live snippet, then the KPI cards with nothing in them yet. The
 * page polls for the first trace and swaps to the dashboard on its own.
 */
export function FirstRun({ projectName, environment }: FirstRunProps) {
  return (
    <>
      <ConnectCard projectName={projectName} environment={environment} />
      <EmptyKpiCards />
    </>
  );
}

function ConnectCard({ projectName, environment }: FirstRunProps) {
  const { orgId, projectId } = useProjectParams();
  const org = useCurrentOrg();

  return (
    <Card className="flex flex-col gap-8 overflow-hidden p-6 sm:p-9 xl:flex-row xl:gap-12">
      <MeshWash />
      <div className="relative flex flex-col gap-7 xl:w-[430px] xl:shrink-0">
        <Illustration />
        <div className="flex flex-col gap-2.5">
          <h2 className="text-h2 text-foreground">Connect your app to start tracing</h2>
          <p className="text-sm text-muted-foreground">
            Add the Python SDK, wrap your OpenAI or Anthropic client, or point any OpenTelemetry
            exporter at Spanlight. Traces show up here within seconds.
          </p>
        </div>
        <SetupSteps projectName={projectName} environment={environment} />
        <div className="flex flex-wrap gap-2.5">
          <Button asChild variant="primary" size="lg">
            <Link to="/onboarding" search={{ org: orgId, project: projectId }}>
              Connect your app
            </Link>
          </Button>
          {org && !org.is_demo ? <TryDemoButton /> : null}
        </div>
      </div>
      <SnippetPanel environment={environment} />
    </Card>
  );
}

/** Soft lavender / butter / sky blobs behind the illustration (Figma "Mesh wash"). */
function MeshWash() {
  return (
    <div aria-hidden className="pointer-events-none absolute -top-40 -left-36 h-[360px] w-[520px]">
      <span className="absolute top-10 left-10 h-[220px] w-[300px] rounded-full bg-mesh-1 opacity-60 blur-3xl" />
      <span className="absolute top-2.5 left-[220px] h-[180px] w-[240px] rounded-full bg-mesh-2 opacity-50 blur-3xl" />
      <span className="absolute top-[170px] left-[120px] h-[160px] w-[280px] rounded-full bg-mesh-3 opacity-60 blur-3xl" />
    </div>
  );
}

function Illustration() {
  return (
    <div aria-hidden className="relative h-[104px] w-[132px]">
      <span className="absolute top-2.5 left-0 h-[84px] w-24 rounded-full bg-mesh-1 opacity-80 blur-xl" />
      <span className="absolute top-0 left-[46px] h-[70px] w-20 rounded-full bg-mesh-2 opacity-80 blur-xl" />
      <span className="absolute top-10 left-[34px] h-16 w-[92px] rounded-full bg-mesh-3 opacity-80 blur-xl" />
      <span className="absolute top-5 left-[34px] flex size-16 items-center justify-center rounded-[20px] border border-border bg-surface shadow-lg">
        <Activity className="size-7 text-accent" strokeWidth={2} />
      </span>
      <span className="absolute top-3.5 left-[90px] size-3.5 rounded-full border-[3px] border-surface bg-lime" />
    </div>
  );
}

interface SetupStepsProps {
  projectName: string | null;
  environment: string | undefined;
}

function SetupSteps({ projectName, environment }: SetupStepsProps) {
  const projectDetail = [projectName, environment].filter(Boolean).join(" · ");
  return (
    <ol className="flex flex-col gap-1.5">
      <li className="flex items-center gap-3.5 rounded-tile px-3 py-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
          <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-foreground">
            Create a project
            <span className="sr-only"> (done)</span>
          </span>
          {projectDetail ? (
            <span className="truncate text-xs font-medium text-subtle-foreground">
              {projectDetail}
            </span>
          ) : null}
        </span>
      </li>
      <li
        aria-current="step"
        className="flex items-center gap-3.5 rounded-tile bg-surface-muted px-3 py-2.5"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-ink-foreground">
          2
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-foreground">
            Install the SDK and add your API key
          </span>
          <span className="text-xs font-medium text-subtle-foreground">
            pip install spanlight, then call init()
          </span>
        </span>
      </li>
      <li className="flex items-center gap-3.5 rounded-tile px-3 py-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-sm font-semibold text-muted-foreground">
          3
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-muted-foreground">Send a trace</span>
          <span className="text-xs font-medium text-subtle-foreground">
            Run your app — this page updates on its own
          </span>
        </span>
      </li>
    </ol>
  );
}

/**
 * "Try the live demo" signs the browser in as the shared demo visitor, which ends the current
 * session, so it asks first.
 */
function TryDemoButton() {
  const me = useMe();
  const demo = useDemoSession();
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="lg">Try the live demo</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Open the live demo?</AlertDialogTitle>
          <AlertDialogDescription>
            The demo is a shared, read-only workspace with sample traces. Opening it signs you out
            of {me.user.email}; sign back in any time to return to this project.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay here</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Keep the dialog open with a spinner until the session switch finishes.
              event.preventDefault();
              demo.mutate(undefined, {
                onSettled: () => {
                  setOpen(false);
                },
              });
            }}
            disabled={demo.isPending}
            aria-busy={demo.isPending || undefined}
          >
            {demo.isPending ? "Opening…" : "Open the demo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------- Snippet panel ---------- */

const TOKEN_CLASSES: Record<CodeTokenKind, string | undefined> = {
  plain: undefined,
  keyword: "text-rail-muted-foreground",
  decorator: "text-code-string",
  string: "text-code-string",
  comment: "text-code-comment",
  prompt: "text-code-comment select-none",
};

function SnippetPanel({ environment }: { environment: string | undefined }) {
  const snippets = buildSnippets({
    apiKey: null,
    host: window.location.origin,
    environment: environment ?? DEFAULT_ENVIRONMENT,
  }).filter((snippet) => (SNIPPET_TABS as readonly string[]).includes(snippet.id));
  const [active, setActive] = useState<string>(snippets[0]?.id ?? "python");
  const activeSnippet = snippets.find((snippet) => snippet.id === active) ?? snippets[0];
  const copyValue = activeSnippet?.blocks.at(-1)?.code ?? "";

  return (
    <Tabs
      value={active}
      onValueChange={setActive}
      className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-hero-card text-hero-card-foreground shadow-lg xl:self-start dark:border dark:border-border"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rail-tile p-3">
        <TabsList aria-label="Integration method" className="border-0 bg-rail-tile p-[3px]">
          {snippets.map((snippet) => (
            <TabsTrigger
              key={snippet.id}
              value={snippet.id}
              className="h-auto px-3 py-1.5 text-xs text-rail-muted-foreground hover:text-rail-foreground focus-visible:outline-lime data-[state=active]:bg-lime data-[state=active]:font-medium data-[state=active]:text-lime-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-lime"
            >
              {snippet.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <CopyButton
          value={copyValue}
          label="Copy"
          aria-label={`Copy the ${activeSnippet?.label ?? ""} code`}
          tone="ink"
          showLabel
          size="sm"
          className="h-auto shrink-0 border border-rail-tile bg-transparent py-1.5 pr-3 pl-2.5 text-xs font-medium text-rail-muted-foreground [&_svg]:size-3.5"
        />
      </div>
      {snippets.map((snippet) => (
        <TabsContent key={snippet.id} value={snippet.id} className="pt-0">
          <SnippetListing snippet={snippet} />
        </TabsContent>
      ))}
      <div className="mt-auto flex items-center gap-2.5 border-t border-rail-tile px-5 py-3.5">
        <StatusDot state="live" />
        <p className="text-xs font-medium text-rail-muted-foreground">
          Waiting for the first span{environment ? ` from ${environment}` : ""}…
        </p>
      </div>
    </Tabs>
  );
}

function SnippetListing({ snippet }: { snippet: Snippet }) {
  const lines = snippetLines(snippet.blocks);
  return (
    <pre
      tabIndex={0}
      aria-label={`${snippet.label} setup code`}
      className="max-h-[348px] overflow-auto px-5 py-[18px] font-mono text-code text-rail-foreground focus-visible:outline-offset-[-2px] focus-visible:outline-lime"
    >
      <code className="flex w-max min-w-full flex-col">
        {lines.map((tokens, lineIndex) => (
          <span key={lineIndex} className="flex gap-4">
            <span
              aria-hidden
              className="w-[18px] shrink-0 text-right text-rail-subtle-foreground select-none"
            >
              {lineIndex + 1}
            </span>
            <span className="whitespace-pre">
              {tokens.map((token, tokenIndex) => {
                const tokenClass = TOKEN_CLASSES[token.kind];
                return tokenClass ? (
                  <span key={tokenIndex} className={tokenClass}>
                    {token.text}
                  </span>
                ) : (
                  <Fragment key={tokenIndex}>{token.text}</Fragment>
                );
              })}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}
