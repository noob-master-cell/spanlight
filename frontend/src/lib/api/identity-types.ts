/**
 * Account, organisation, membership, token and audit types, mirroring the backend's bodies
 * exactly (snake_case). Re-exported through `types.ts`.
 */

export type Role = "owner" | "admin" | "member" | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  /** True once the owner of the address has proven it. */
  email_verified: boolean;
}

export interface Org {
  id: string;
  name: string;
  slug: string;
  is_demo: boolean;
  /** Whether members must have two-factor authentication to use the org. */
  require_2fa: boolean;
}

export interface OrgWithRole extends Org {
  role: Role;
}

export interface Membership {
  org: Org;
  role: Role;
}

export interface Me {
  user: User;
  memberships: Membership[];
  /** False for someone who signed up with GitHub or Google and never set a password. */
  has_password: boolean;
  /** Whether two-factor authentication is on for the caller (the org's `require_2fa` is separate). */
  totp_enabled: boolean;
  /**
   * True only when the server can send email and the caller's address is still unverified. False
   * on a server without email, where nothing could be verified, so no prompt is shown there.
   */
  email_verification_required: boolean;
}

/** `POST /auth/login` when the password was enough: the session cookies are set. */
export interface LoginSignedIn {
  status: "signed_in";
  user: User;
}

/**
 * `POST /auth/login` when the password was right but the account has two-factor authentication:
 * no cookies are set. The challenge goes to `POST /auth/totp/verify` with a code before it expires.
 */
export interface LoginTotpRequired {
  status: "totp_required";
  challenge: string;
  expires_at: string;
}

/** The answer to `POST /auth/login`; branch on `status`. */
export type LoginOut = LoginSignedIn | LoginTotpRequired;

/** The answer to a request the worker finishes later (a queued email). */
export interface Accepted {
  status: "accepted";
}

export interface TotpStatus {
  enabled: boolean;
  enabled_at: string | null;
  /** 0 when two-factor authentication is off. */
  recovery_codes_remaining: number;
}

/** What to add to an authenticator app. Returned once; the secret is never shown again. */
export interface TotpSetup {
  secret: string;
  otpauth_url: string;
}

/** The recovery codes in clear text, this once: the server keeps only their hashes. */
export interface TotpEnabled {
  recovery_codes: string[];
}

export type OAuthProvider = "github" | "google";

export interface OAuthProviderInfo {
  provider: OAuthProvider;
}

/** A sign-in provider account linked to the caller. */
export interface OAuthIdentity {
  provider: OAuthProvider;
  email: string | null;
  created_at: string;
  last_used_at: string;
}

/** `read` may only read; `write` may also change things. */
export type TokenScope = "read" | "write";

export interface PersonalAccessToken {
  id: string;
  name: string;
  prefix: string;
  scope: TokenScope;
  created_at: string;
  /** Null: the token never expires. */
  expires_at: string | null;
  last_used_at: string | null;
}

/** Returned once, on creation: `token` is the whole secret and is never shown again. */
export interface CreatedPersonalAccessToken extends PersonalAccessToken {
  token: string;
}

export interface AuthSession {
  id: string;
  created_at: string;
  last_seen_at: string;
  ip: string | null;
  user_agent: string | null;
  current: boolean;
}

export interface Member {
  user: User;
  role: Role;
  created_at: string;
}

export interface Invite {
  id: string;
  role: Role;
  /** The address the link was mailed to; null when the link is shared by hand. */
  email: string | null;
  expires_at: string;
}

export interface PendingInvite extends Invite {
  created_at: string;
}

export interface CreatedInvite extends Invite {
  url: string;
}

export interface InviteAcceptance {
  org: Org;
  role: Role;
}

/** What an invite grants, shown before accepting. */
export interface InvitePreview {
  org: Pick<Org, "id" | "name" | "slug">;
  role: Role;
  expires_at: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  actor: User | null;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}
