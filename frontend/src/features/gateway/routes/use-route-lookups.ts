import { useCallback } from "react";

import type { Credential, GatewayKey } from "@/lib/api";

import { useCredentialsQuery, useGatewayKeysQuery } from "../gateway-queries";

import { keysUsingRoute } from "./route-summary";
import type { CredentialNamer } from "./version-diff";

export interface RouteLookups {
  /** The org's credentials; empty until they load. */
  credentials: readonly Credential[];
  credentialsLoaded: boolean;
  /** The credentials request's failure, for an error state where the names are required. */
  credentialsError: unknown;
  retryCredentials: () => void;
  nameOf: CredentialNamer;
  /** Active keys on a route, or null while the key list is loading or failed. */
  keysFor: (routeId: string) => GatewayKey[] | null;
}

/**
 * What routes refer to by id, for the list and the editor: credential names and the gateway keys
 * that use each route. Both load beside the routes; until they do, names and counts read as
 * unknown rather than as wrong values.
 */
export function useRouteLookups(): RouteLookups {
  const credentialsQuery = useCredentialsQuery();
  const keysQuery = useGatewayKeysQuery();
  const credentials = credentialsQuery.data;
  const keys = keysQuery.data;

  const nameOf = useCallback<CredentialNamer>(
    (credentialId) =>
      credentials?.find((credential) => credential.id === credentialId)?.name ?? null,
    [credentials],
  );
  const keysFor = useCallback(
    (routeId: string) => (keys === undefined ? null : keysUsingRoute(keys, routeId)),
    [keys],
  );

  return {
    credentials: credentials ?? [],
    credentialsLoaded: credentials !== undefined,
    credentialsError: credentialsQuery.error,
    retryCredentials: () => {
      void credentialsQuery.refetch();
    },
    nameOf,
    keysFor,
  };
}
