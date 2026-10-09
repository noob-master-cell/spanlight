/**
 * Types mirroring the backend API's request and response bodies; clarifications are in
 * docs/api-deviations.md.
 * Field names are snake_case to match the wire format exactly; money is a
 * decimal string and every "unknown" value is `null`, never zero.
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

export interface Project {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  retention_days: number;
  capture_payloads: boolean;
  created_at: string;
}

export interface ProjectUpdate {
  name?: string;
  retention_days?: number;
  capture_payloads?: boolean;
}

/**
 * What a project API key may do. The dashboard offers `ingest:write` and `traces:read`; the other
 * two are reserved by the server and no route accepts them yet.
 */
export type KeyScope = "ingest:write" | "traces:read" | "scores:write" | "prompts:read";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: KeyScope[];
  created_by: User | null;
  created_at: string;
  last_used_at: string | null;
  /** Null: the key never expires. */
  expires_at: string | null;
  revoked_at: string | null;
}

export interface CreatedApiKey extends ApiKey {
  secret: string;
}

export interface OnboardingStatus {
  has_traces: boolean;
  first_trace_at: string | null;
}

export type SpanKind = "llm" | "tool" | "retrieval" | "chain" | "http" | "other";
export type SpanStatus = "ok" | "error" | "unset";
export type TraceStatusFilter = "ok" | "error";

export interface TraceSummary {
  trace_id: string;
  name: string | null;
  environment: string | null;
  release: string | null;
  external_user_id: string | null;
  session_id: string | null;
  tags: string[];
  started_at: string;
  ended_at: string;
  duration_ms: number;
  span_count: number;
  error_count: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string | null;
  has_unpriced: boolean;
  models: string[];
  /** Earliest failed span's status message; null when nothing failed or no message was sent. */
  error_message: string | null;
}

export interface Span {
  span_id: string;
  parent_span_id: string | null;
  kind: SpanKind;
  name: string;
  status: SpanStatus;
  status_message: string | null;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  cost_usd: string | null;
  pricing_version: string | null;
  time_to_first_token_ms: number | null;
  input: unknown;
  output: unknown;
  attributes: Record<string, unknown>;
  truncated: boolean;
}

export interface TraceDetail extends TraceSummary {
  spans: Span[];
}

export interface SessionSummary {
  session_id: string;
  trace_count: number;
  first_at: string;
  last_at: string;
  cost_usd: string | null;
  error_count: number;
}

export interface Kpis {
  traces: number;
  llm_calls: number;
  error_rate: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  cost_usd: string | null;
  unpriced_calls: number;
  input_tokens: number;
  output_tokens: number;
}

export interface OverviewMetrics {
  current: Kpis;
  previous: Kpis;
  /** True when read from hourly rollups (windows over 24 h): percentiles are estimates. */
  approximate: boolean;
}

export type Bucket = "hour" | "day";

export interface TimeseriesPoint {
  bucket_start: string;
  llm_calls: number;
  errors: number;
  p95_ms: number | null;
  cost_usd: string | null;
  tokens: number;
  approximate: boolean;
}

export interface ModelMetrics {
  provider: string | null;
  model: string | null;
  calls: number;
  errors: number;
  p50_ms: number | null;
  p95_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string | null;
  approximate: boolean;
}

export interface Price {
  provider: string;
  /** Matches a model exactly or with a snapshot suffix (`-YYYYMMDD`, `-latest`). */
  model_pattern: string;
  /** USD per million tokens, as decimal strings. */
  input_per_mtok: string;
  output_per_mtok: string;
  /** Null when the provider has no separate cached-input price. */
  cached_input_per_mtok: string | null;
  effective_from: string;
  version: string;
}

/** A model with LLM usage in a window whose calls got no cost for want of a price. */
export interface UnpricedModel {
  provider: string | null;
  model: string;
  llm_calls: number;
  input_tokens: number;
  output_tokens: number;
}

export type ExportFormat = "jsonl" | "csv";
export type ExportStatus = "queued" | "running" | "done" | "failed" | "expired";

/**
 * The trace-list filters an export applies. `from` and `to` are required and at most 90 days
 * apart. The server returns the filters it stored with `null` for those that were not set.
 */
export interface ExportFilters {
  from: string;
  to: string;
  environment?: string | null;
  release?: string | null;
  model?: string | null;
  status?: TraceStatusFilter | null;
  user_id?: string | null;
  session_id?: string | null;
  tag?: string | null;
  q?: string | null;
}

export interface TraceExport {
  id: string;
  format: ExportFormat;
  filters: ExportFilters;
  status: ExportStatus;
  row_count: number | null;
  size_bytes: number | null;
  /** Set when `status` is `failed`, e.g. `EXPORT_TOO_LARGE`, `EXPORT_TIMEOUT` or `EXPORT_FAILED`. */
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
  /** When the file is deleted; null until the export is done. */
  expires_at: string | null;
  /** A presigned link valid for one hour, present only while `status` is `done`. */
  download_url: string | null;
}

export interface FilterOptions {
  environments: string[];
  releases: string[];
  models: string[];
  tags: string[];
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface ProblemFieldError {
  field: string;
  message: string;
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  request_id?: string;
  errors?: ProblemFieldError[];
  /** An RFC 9457 extension member of `409 ROUTE_VERSION_CONFLICT`. */
  current_version?: number;
}

export type * from "./gateway-types";
