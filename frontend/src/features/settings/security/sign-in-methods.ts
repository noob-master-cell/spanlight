import type { Membership, OAuthIdentity, OAuthProvider, OAuthProviderInfo } from "@/lib/api";

export const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  github: "GitHub",
  google: "Google",
};

/** The order the providers are listed in, whatever order the server names them. */
const PROVIDER_ORDER: readonly OAuthProvider[] = ["github", "google"];

export interface ProviderMethod {
  kind: "provider";
  provider: OAuthProvider;
  /** The linked account, or null when this provider is not connected. */
  identity: OAuthIdentity | null;
  /** Disconnecting would leave no way to sign in. */
  onlyMethod: boolean;
}

export type SignInMethod = { kind: "password"; isSet: boolean } | ProviderMethod;

/**
 * Whether `provider` is the one way the person can sign in: no password, and it is their only
 * linked account. The server refuses to unlink it (`409 LAST_SIGN_IN_METHOD`), so the page does not
 * offer to.
 */
export function isOnlySignInMethod(
  hasPassword: boolean,
  identities: readonly OAuthIdentity[],
  provider: OAuthProvider,
): boolean {
  return !hasPassword && identities.length === 1 && identities[0]?.provider === provider;
}

interface SignInMethodsInput {
  hasPassword: boolean;
  /** The providers this server has set up: only these are listed. */
  providers: readonly OAuthProviderInfo[];
  identities: readonly OAuthIdentity[];
}

/** The rows of the "Sign-in methods" card: the password, then each provider the server offers. */
export function buildSignInMethods({
  hasPassword,
  providers,
  identities,
}: SignInMethodsInput): SignInMethod[] {
  const offered = new Set(providers.map(({ provider }) => provider));
  const rows: SignInMethod[] = [{ kind: "password", isSet: hasPassword }];
  for (const provider of PROVIDER_ORDER) {
    if (offered.has(provider)) {
      rows.push({
        kind: "provider",
        provider,
        identity: identities.find((identity) => identity.provider === provider) ?? null,
        onlyMethod: isOnlySignInMethod(hasPassword, identities, provider),
      });
    }
  }
  return rows;
}

/**
 * Whether this is the shared demo account: its only organization is the demo one. It can't link or
 * unlink a sign-in provider (the server refuses with a `403`).
 */
export function isDemoAccount(memberships: readonly Membership[]): boolean {
  return memberships.some(({ org }) => org.is_demo);
}
