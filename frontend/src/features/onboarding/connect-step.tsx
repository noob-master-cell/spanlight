import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";

import type { CreatedApiKey, Membership, OnboardingStatus, Project } from "@/lib/api";
import { can } from "@/lib/permissions";

import { ApiKeyCard } from "./api-key-card";
import { FirstTraceCard, WaitingForTrace } from "./first-trace-status";
import { GatewaySetupCard } from "./gateway-setup-card";
import { SnippetTabs } from "./snippet-tabs";
import type { SnippetId } from "./snippets";

interface ConnectStepProps {
  membership: Membership;
  project: Project;
  /** The polling onboarding status, owned by the page so the step pills can show completion. */
  status: UseQueryResult<OnboardingStatus>;
}

/**
 * Step 3. While waiting: API key card, snippets, then the live "waiting" row. Once the first
 * trace arrives the success card moves to the top. The key card stays while its secret is on
 * screen, because it can't be shown again.
 */
export function ConnectStep({ membership, project, status }: ConnectStepProps) {
  // The secret is only returned once, so it lives here and is never cached.
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [snippetId, setSnippetId] = useState<SnippetId>("python");
  const received = status.data?.has_traces === true;

  const keyCard = (
    <ApiKeyCard
      projectId={project.id}
      projectName={project.name}
      role={membership.role}
      canCreateKeys={can(membership.role, "key:create")}
      createdKey={createdKey}
      onCreated={setCreatedKey}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Announces the switch to the success state; the visible cards live in different places. */}
      <p role="status" className="sr-only">
        {received ? "Connected. Your first trace has arrived." : ""}
      </p>

      {received ? (
        <FirstTraceCard
          orgId={membership.org.id}
          projectId={project.id}
          firstTraceAt={status.data?.first_trace_at ?? null}
        />
      ) : null}

      {snippetId === "gateway" ? (
        <GatewaySetupCard orgId={membership.org.id} projectId={project.id} />
      ) : received && createdKey === null ? null : (
        keyCard
      )}

      <SnippetTabs
        apiKey={createdKey?.secret ?? null}
        value={snippetId}
        onValueChange={setSnippetId}
        orgId={membership.org.id}
        projectId={project.id}
      />

      {received ? null : (
        <WaitingForTrace
          gateway={snippetId === "gateway"}
          error={status.isError && !status.data ? status.error : null}
          onRetry={() => {
            void status.refetch();
          }}
        />
      )}
    </div>
  );
}
