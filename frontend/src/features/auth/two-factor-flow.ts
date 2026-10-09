import { errorMessage, isApiError } from "@/lib/api";

/** `code` is the six digits from the authenticator app; `recovery` is one of the saved codes. */
export type CodeMode = "code" | "recovery";

export const CODE_LENGTH = 6;

/** Keeps the digits of whatever was typed or pasted ("123 456" → "123456"), at most six. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

/** Whether there is enough to send: all six digits, or any text for a recovery code. */
export function canSubmitCode(mode: CodeMode, value: string): boolean {
  return mode === "code" ? value.length === CODE_LENGTH : value.trim().length > 0;
}

export type TwoFactorFailure =
  | { kind: "wrong-code" }
  | { kind: "expired" }
  | { kind: "rate-limited" }
  | { kind: "other"; message: string };

/** What a failed `POST /auth/totp/verify` means for the screen. */
export function classifyTwoFactorError(error: unknown): TwoFactorFailure {
  if (isApiError(error)) {
    if (error.status === 429) {
      return { kind: "rate-limited" };
    }
    if (error.status === 401 && error.code === "TOTP_CHALLENGE_INVALID") {
      return { kind: "expired" };
    }
    if (error.status === 401 && error.code === "INVALID_TOTP_CODE") {
      return { kind: "wrong-code" };
    }
  }
  return { kind: "other", message: errorMessage(error) };
}

export const EXPIRED_MESSAGE = "Your sign-in timed out. Sign in again.";

/** The line under the field for a failure that leaves the form on screen. */
export function failureMessage(
  failure: Exclude<TwoFactorFailure, { kind: "expired" }>,
  mode: CodeMode,
): string {
  switch (failure.kind) {
    case "wrong-code":
      return mode === "code"
        ? "That code didn't work. Check your device's clock and try again."
        : "That recovery code didn't work. Check it and try again.";
    case "rate-limited":
      return "Too many attempts. Wait 15 minutes, then try again.";
    case "other":
      return failure.message;
  }
}
