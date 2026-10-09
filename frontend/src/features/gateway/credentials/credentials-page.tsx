import { KeyRound, Plus } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { TileListSkeleton } from "@/components/tile-list";
import { Button } from "@/components/ui/button";
import { useCurrentOrg, usePermission } from "@/features/shell";
import type { Route } from "@/lib/api";

import { useGatewayRoutesQuery } from "../gateway-queries";
import { GatewayLayout } from "../gateway-layout";
import { AddCredentialDialog } from "./add-credential-dialog";
import { CredentialList } from "./credential-list";
import { NOT_CONFIGURED_COPY, OWNER_ONLY_REASON } from "./credential-model";
import { useCredentialsQuery } from "./credentials-queries";

/**
 * Figma "Gateway — Credentials" and its states. Org-level: every member reads the list, only
 * owners add, check, rotate or delete. The page learns the server has no `CREDENTIALS_KEYS` only
 * from a `409 NOT_CONFIGURED` answer, then shows the notice and stops offering Add.
 */
export function GatewayCredentialsPage() {
  const org = useCurrentOrg();
  const orgName = org?.name ?? null;
  const canManage = usePermission("credentials:manage");
  const credentialsQuery = useCredentialsQuery();
  // Best effort: it only adds "Used by route" hints, so a failure here never blocks the list.
  const routes = useGatewayRoutesQuery().data ?? [];
  const [notConfigured, setNotConfigured] = useState(false);
  const ownerReasonId = useId();
  const notConfiguredId = useId();

  const addDisabled = !canManage || notConfigured;
  // `aria-disabled`, not `disabled`: the button keeps focus when the dialog closes into the
  // not-configured state, and screen readers reach the reason it points at.
  const addAction = (
    <AddCredentialDialog
      disabled={addDisabled}
      orgName={orgName}
      onNotConfigured={() => {
        setNotConfigured(true);
      }}
      trigger={
        <Button
          variant="primary"
          aria-disabled={addDisabled || undefined}
          aria-describedby={addDisabled ? (canManage ? notConfiguredId : ownerReasonId) : undefined}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          <Plus aria-hidden />
          Add credential
        </Button>
      }
    />
  );

  return (
    <GatewayLayout>
      <SectionCard
        title="Provider credentials"
        description={
          <>
            Shared by every project in {orgName ?? "your organization"}. Keys are encrypted at rest
            and never shown again.
          </>
        }
        actions={addAction}
      >
        {notConfigured ? (
          <div id={notConfiguredId}>
            <Callout tone="warning" role="alert">
              {NOT_CONFIGURED_COPY}
            </Callout>
          </div>
        ) : null}
        {canManage ? null : (
          <div id={ownerReasonId}>
            <Callout tone="info" title={OWNER_ONLY_REASON}>
              You can see the credentials your routes use. Ask an owner to add, check, rotate or
              delete one.
            </Callout>
          </div>
        )}
        <CredentialsContent
          query={credentialsQuery}
          routes={routes}
          canManage={canManage}
          ownerReasonId={ownerReasonId}
          notConfigured={notConfigured}
          addAction={addAction}
          onNotConfigured={() => {
            setNotConfigured(true);
          }}
        />
        <p className="px-1 text-xs font-medium text-subtle-foreground">
          Checking calls the provider&rsquo;s model list with the stored key. Deleting is blocked
          while a route targets the credential.
        </p>
      </SectionCard>
    </GatewayLayout>
  );
}

interface CredentialsContentProps {
  query: ReturnType<typeof useCredentialsQuery>;
  routes: readonly Route[];
  canManage: boolean;
  /** The id of the inline "owners only" notice, for disabled controls to point at. */
  ownerReasonId: string;
  notConfigured: boolean;
  addAction: ReactNode;
  onNotConfigured: () => void;
}

function CredentialsContent({
  query,
  routes,
  canManage,
  ownerReasonId,
  notConfigured,
  addAction,
  onNotConfigured,
}: CredentialsContentProps) {
  if (query.isPending) {
    return <TileListSkeleton label="Loading credentials" />;
  }

  if (query.isError) {
    return (
      <ErrorState
        compact
        error={query.error}
        title="Couldn't load credentials"
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }

  if (query.data.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title="No provider credentials"
        description={
          notConfigured
            ? "Once the server key is set, add an OpenAI, Anthropic or OpenAI-compatible key here."
            : "Add an OpenAI, Anthropic or OpenAI-compatible key so routes can call providers."
        }
        action={canManage ? addAction : undefined}
      />
    );
  }

  return (
    <CredentialList
      credentials={query.data}
      routes={routes}
      canManage={canManage}
      ownerReasonId={ownerReasonId}
      onNotConfigured={onNotConfigured}
    />
  );
}
