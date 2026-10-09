import type { ProblemDetails, ProblemFieldError } from "./types";

/** A failed API call, parsed from an RFC 9457 problem+json body when available. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string | null;
  readonly requestId: string | null;
  readonly fieldErrors: ProblemFieldError[];

  constructor(status: number, problem: ProblemDetails) {
    const title = problem.title ?? defaultTitle(status);
    super(problem.detail ?? title);
    this.name = "ApiError";
    this.status = status;
    this.code = problem.code ?? `HTTP_${status}`;
    this.title = title;
    this.detail = problem.detail ?? null;
    this.requestId = problem.request_id ?? null;
    this.fieldErrors = problem.errors ?? [];
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/** Thrown when the request never produced an HTTP response (offline, DNS, CORS, abort). */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("Can't reach the server. Check your connection and try again.", { cause });
    this.name = "NetworkError";
  }
}

/**
 * The password was right, but the account needs a second factor before it is signed in. Carries
 * the challenge the second step sends back to the server with a code.
 */
export class TwoFactorRequiredError extends Error {
  readonly challenge: string;
  readonly expiresAt: string;

  constructor(challenge: string, expiresAt: string) {
    super(
      "This account uses two-factor authentication, and the dashboard can't finish that step yet.",
    );
    this.name = "TwoFactorRequiredError";
    this.challenge = challenge;
    this.expiresAt = expiresAt;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** A short, human-readable message for any error thrown by the API layer. */
export function errorMessage(error: unknown): string {
  if (
    error instanceof ApiError ||
    error instanceof NetworkError ||
    error instanceof TwoFactorRequiredError
  ) {
    return error.message;
  }
  return "Something went wrong. Try again.";
}

function defaultTitle(status: number): string {
  if (status === 401) return "Not signed in";
  if (status === 403) return "Not allowed";
  if (status === 404) return "Not found";
  if (status === 409) return "Conflict";
  if (status === 422) return "Invalid request";
  if (status === 429) return "Too many requests";
  if (status >= 500) return "Server error";
  return "Request failed";
}
