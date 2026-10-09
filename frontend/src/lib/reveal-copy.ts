/** The secret kinds a create dialog reveals once: an ingest API key, a token, a gateway key. */
export type SecretKind = "key" | "token" | "gateway_key";

interface RevealCopy {
  title: string;
  /** The §9.1 warning: the secret is gone once the dialog closes. */
  warning: string;
  secretLabel: string;
  copyAriaLabel: string;
}

/** The line that puts a Settings secret to use, shown under it with its own Copy button. */
interface UsageCopy {
  usageHint: string;
  usageCopyLabel: string;
  usageLine: (secret: string) => string;
}

/** The environment line the SDK reads an ingest API key from. */
export function envLine(secret: string): string {
  return `SPANLIGHT_API_KEY=${secret}`;
}

/**
 * Everything that differs between "Key created", "Token created" and the gateway "Key created".
 * The gateway reveal shows SDK snippets instead of a usage line.
 */
export const REVEAL_COPY: {
  key: RevealCopy & UsageCopy;
  token: RevealCopy & UsageCopy;
  gateway_key: RevealCopy;
} = {
  key: {
    title: "Key created",
    warning: "Copy this key now. You won't be able to see it again.",
    secretLabel: "Secret key",
    copyAriaLabel: "Copy API key",
    usageHint: "Set it in your application's environment. The SDK reads it automatically:",
    usageCopyLabel: "Copy environment variable",
    usageLine: envLine,
  },
  token: {
    title: "Token created",
    warning: "Copy this token now. You won't be able to see it again.",
    secretLabel: "Personal access token",
    copyAriaLabel: "Copy personal access token",
    usageHint: "Send it as a bearer token in the Authorization header:",
    usageCopyLabel: "Copy Authorization header",
    usageLine: (secret) => `Authorization: Bearer ${secret}`,
  },
  gateway_key: {
    title: "Key created",
    warning: "Copy this key now. You won't be able to see it again.",
    secretLabel: "Secret key",
    copyAriaLabel: "Copy gateway key",
  },
};
