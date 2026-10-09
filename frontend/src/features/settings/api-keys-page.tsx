import { KeyRound } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/queries";
import { usePermission } from "@/features/shell/project-context";

import { ApiKeyList } from "./api-key-list";
import { useApiKeysQuery } from "./api-key-queries";
import { sortApiKeys, type RevokeAbility } from "./api-key-utils";
import { CreateApiKeyDialog } from "./create-api-key-dialog";
import { DisabledReason } from "./disabled-reason";
import { TileListSkeleton } from "./settings-list";
import { SettingsSection } from "./settings-section";

export function ApiKeysPage() {
  const me = useMe();
  const keysQuery = useApiKeysQuery();
  const canCreate = usePermission("key:create");
  const ability: RevokeAbility = {
    canRevokeAny: usePermission("key:revoke_any"),
    canRevokeOwn: usePermission("key:revoke_own"),
    userId: me.user.id,
  };

  return (
    <SettingsSection
      title="API keys"
      description="Keys let an application send traces to this project. A secret is shown once, when the key is created."
      actions={<CreateKeyButton canCreate={canCreate} />}
      className="gap-3"
    >
      <ApiKeysContent
        query={keysQuery}
        ability={ability}
        emptyAction={canCreate ? <CreateKeyButton canCreate /> : undefined}
      />
    </SettingsSection>
  );
}

interface ApiKeysContentProps {
  query: ReturnType<typeof useApiKeysQuery>;
  ability: RevokeAbility;
  emptyAction: ReactNode;
}

function ApiKeysContent({ query, ability, emptyAction }: ApiKeysContentProps) {
  if (query.isPending) {
    return <TileListSkeleton label="Loading API keys" rows={3} />;
  }

  if (query.isError) {
    return (
      <ErrorState
        compact
        error={query.error}
        title="Couldn't load API keys"
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
        title="No API keys yet"
        description="Create a key to start sending traces from your application."
        action={emptyAction}
      />
    );
  }

  return (
    <>
      <ApiKeyList keys={sortApiKeys(query.data)} ability={ability} />
      <p className="flex items-start gap-2 px-1 pt-1.5 text-xs font-medium text-subtle-foreground">
        <KeyRound aria-hidden className="mt-px size-3.5 shrink-0" />
        <span>
          Revoked keys stop working immediately and stay listed for the audit trail. The SDK reads
          the key from <code className="font-mono">SPANLIGHT_API_KEY</code>.
        </span>
      </p>
    </>
  );
}

function CreateKeyButton({ canCreate }: { canCreate: boolean }) {
  if (!canCreate) {
    return (
      <DisabledReason reason="Viewers can't create API keys. Ask an admin for access.">
        <Button variant="primary" disabled>
          Create key
        </Button>
      </DisabledReason>
    );
  }

  return <CreateApiKeyDialog trigger={<Button variant="primary">Create key</Button>} />;
}
