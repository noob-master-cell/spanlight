import { envLine } from "../api-key-utils";

export type SecretKind = "key" | "token";

interface RevealCopy {
  title: string;
  /** The §9.1 warning: the secret is gone once the dialog closes. */
  warning: string;
  secretLabel: string;
  copyAriaLabel: string;
  usageHint: string;
  usageCopyLabel: string;
  usageLine: (secret: string) => string;
}

/** Everything that differs between "Key created" and "Token created". */
export const REVEAL_COPY: Record<SecretKind, RevealCopy> = {
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
};
