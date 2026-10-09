import { useLocation } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { toast } from "sonner";

import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { TileListSkeleton, TileList } from "@/components/tile-list";
import { useMe } from "@/features/auth";

import { PasswordRow, ProviderRow, type ProviderRestriction } from "./sign-in-method-rows";
import { PROVIDER_LABELS, buildSignInMethods, isDemoAccount } from "./sign-in-methods";
import {
  useOAuthIdentitiesQuery,
  useOAuthProvidersQuery,
  useUnlinkOAuth,
} from "./security-queries";

/**
 * Settings › Security › Sign-in methods: the password and each GitHub or Google account the server
 * offers, with Connect and Disconnect. The last way to sign in can't be disconnected.
 */
export function OAuthConnectionsSection() {
  const {
    user,
    memberships,
    has_password: hasPassword,
    email_verification_required: unverified,
  } = useMe();
  const providers = useOAuthProvidersQuery();
  const identities = useOAuthIdentitiesQuery();
  const unlink = useUnlinkOAuth();
  const returnTo = useLocation({ select: (location) => location.pathname });
  const restriction: ProviderRestriction | null = isDemoAccount(memberships)
    ? "demo"
    : unverified
      ? "unverified"
      : null;

  const methods =
    providers.data && identities.data
      ? buildSignInMethods({
          hasPassword,
          providers: providers.data,
          identities: identities.data,
        })
      : null;

  return (
    <SectionCard
      title="Sign-in methods"
      description="Ways you can sign in to Spanlight. Keep at least one."
      className="gap-3"
    >
      {methods ? (
        <TileList label="Sign-in methods">
          {methods.map((method) =>
            method.kind === "password" ? (
              <PasswordRow key="password" isSet={method.isSet} email={user.email} />
            ) : (
              <ProviderRow
                key={method.provider}
                method={method}
                restriction={restriction}
                returnTo={returnTo}
                disconnecting={unlink.isPending && unlink.variables === method.provider}
                onDisconnect={() => {
                  unlink.mutate(method.provider, {
                    onSuccess: () => {
                      toast.success(`Disconnected ${PROVIDER_LABELS[method.provider]}.`);
                    },
                  });
                }}
              />
            ),
          )}
        </TileList>
      ) : providers.isError || identities.isError ? (
        <ErrorState
          compact
          error={providers.error ?? identities.error}
          title="Couldn't load your sign-in methods"
          onRetry={() => {
            void providers.refetch();
            void identities.refetch();
          }}
        />
      ) : (
        <TileListSkeleton label="Loading sign-in methods" rows={3} className="h-[65px]" />
      )}
      <p className="flex items-center gap-2 px-1 pt-1.5 text-xs font-medium text-subtle-foreground">
        <Info aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
        You can disconnect a provider as long as you keep another way to sign in. Only providers set
        up on this server are listed.
      </p>
    </SectionCard>
  );
}
