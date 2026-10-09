import type { KeyScope, TokenScope } from "@/lib/api";

interface TokenScopeOption {
  value: TokenScope;
  label: string;
  description: string;
}

/** Personal access token scopes: how much the token may do as the person who made it. */
export const TOKEN_SCOPE_OPTIONS: readonly TokenScopeOption[] = [
  {
    value: "read",
    label: "Read",
    description: "View projects, traces and metrics. Can't change anything.",
  },
  {
    value: "write",
    label: "Write",
    description: "Do anything your role allows, except account and sign-in settings.",
  },
];

/** The safer choice comes first and is the default. */
export const DEFAULT_TOKEN_SCOPE: TokenScope = "read";

interface KeyScopeOption {
  value: KeyScope;
  title: string;
  description: string;
}

/**
 * API key scopes the UI offers. The server also accepts `scores:write` and `prompts:read`, which
 * have no route yet, so they are not listed. The order here is the order scopes are sent in.
 */
export const KEY_SCOPE_OPTIONS: readonly KeyScopeOption[] = [
  {
    value: "ingest:write",
    title: "Send traces",
    description: "For the SDK and OpenTelemetry exporters.",
  },
  {
    value: "traces:read",
    title: "Read traces and metrics through the API",
    description: "For scripts and dashboards. Only this project's data.",
  },
];

export const DEFAULT_KEY_SCOPES: readonly KeyScope[] = ["ingest:write"];

export const NO_KEY_SCOPE_HINT = "Choose at least one scope.";

/** The selection with one scope switched on or off, kept in the order the options list them. */
export function toggleKeyScope(
  selected: readonly KeyScope[],
  scope: KeyScope,
  checked: boolean,
): KeyScope[] {
  const next = new Set(selected);
  if (checked) {
    next.add(scope);
  } else {
    next.delete(scope);
  }
  return KEY_SCOPE_OPTIONS.map((option) => option.value).filter((value) => next.has(value));
}

/** An API key needs at least one scope; the server refuses an empty list. */
export function hasKeyScope(selected: readonly KeyScope[]): boolean {
  return selected.length > 0;
}
