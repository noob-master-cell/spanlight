import { api } from "./client";
import { orgPath } from "./paths";
import type {
  Credential,
  CredentialCheck,
  CredentialCreate,
  PriceOverride,
  PriceOverrideCreate,
} from "./types";

function credentialPath(orgId: string, credentialId: string): string {
  return `${orgPath(orgId)}/credentials/${encodeURIComponent(credentialId)}`;
}

/** Provider credentials of an org. `list` needs `org:read`; the rest need `credentials:manage` (owner). */
export const credentialsApi = {
  list: (orgId: string): Promise<Credential[]> =>
    api.get<Credential[]>(`${orgPath(orgId)}/credentials`),
  /** `409 CREDENTIAL_NAME_TAKEN`, or `409 NOT_CONFIGURED` when the server has no master key. */
  create: (orgId: string, input: CredentialCreate): Promise<Credential> =>
    api.post<Credential>(`${orgPath(orgId)}/credentials`, input),
  /** Replaces the stored key; routes keep using the credential. */
  rotate: (orgId: string, credentialId: string, apiKey: string): Promise<Credential> =>
    api.post<Credential>(`${credentialPath(orgId, credentialId)}/rotate`, { api_key: apiKey }),
  /** Calls the provider with the key and reports whether it was accepted. */
  check: (orgId: string, credentialId: string): Promise<CredentialCheck> =>
    api.post<CredentialCheck>(`${credentialPath(orgId, credentialId)}/check`),
  /** `409 CREDENTIAL_IN_USE` while a route targets the credential. */
  delete: (orgId: string, credentialId: string): Promise<void> =>
    api.delete(credentialPath(orgId, credentialId)),
};

/**
 * An org's own model prices, used in place of the shared table when they match. `list` needs
 * `org:read`; `create` and `delete` need `gateway:write` (admin).
 */
export const priceOverridesApi = {
  list: (orgId: string): Promise<PriceOverride[]> =>
    api.get<PriceOverride[]>(`${orgPath(orgId)}/price-overrides`),
  /** `409 PRICE_OVERRIDE_EXISTS` for a provider, model and start time already overridden. */
  create: (orgId: string, input: PriceOverrideCreate): Promise<PriceOverride> =>
    api.post<PriceOverride>(`${orgPath(orgId)}/price-overrides`, input),
  delete: (orgId: string, overrideId: string): Promise<void> =>
    api.delete(`${orgPath(orgId)}/price-overrides/${encodeURIComponent(overrideId)}`),
};
