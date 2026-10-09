import { ApiError, NetworkError } from "./errors";
import type { ProblemDetails } from "./types";

type QueryValue = string | number | boolean | null | undefined;

export type QueryParams = Record<string, QueryValue>;

interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
}

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const CSRF_COOKIE = "spl_csrf";
const CSRF_HEADER = "X-CSRF-Token";
const MUTATING_METHODS: ReadonlySet<HttpMethod> = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Prefix of every dashboard API route. Breaking changes to the API ship as a new version. */
export const API_PREFIX = "/api/v1";

/** Paths that legitimately return 401 without meaning "your session expired". */
const UNAUTHENTICATED_PATHS = [
  `${API_PREFIX}/auth/me`,
  `${API_PREFIX}/auth/login`,
  `${API_PREFIX}/auth/signup`,
  // A wrong code or an expired challenge is a 401 here, from someone who is not signed in yet.
  `${API_PREFIX}/auth/totp/verify`,
];

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler = () => {
  redirectToLogin();
};

/** Override what happens when a request returns 401 (used by tests). */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

export function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const cookie = part.trim();
    if (cookie.startsWith(prefix)) {
      return decodeURIComponent(cookie.slice(prefix.length));
    }
  }
  return null;
}

export function buildUrl(path: string, query?: QueryParams): string {
  if (!query) {
    return path;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

async function request<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken) {
      headers.set(CSRF_HEADER, csrfToken);
    }
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: "same-origin",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new NetworkError(error);
  }

  if (!response.ok) {
    const problem = await readProblem(response);
    if (response.status === 401 && !UNAUTHENTICATED_PATHS.includes(path)) {
      onUnauthorized();
    }
    throw new ApiError(response.status, problem);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function readProblem(response: Response): Promise<ProblemDetails> {
  try {
    const text = await response.text();
    if (!text) {
      return { status: response.status };
    }
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Non-JSON error body (e.g. a proxy error page): fall back to the status code.
  }
  return { status: response.status };
}

function redirectToLogin(): void {
  const { pathname, search } = window.location;
  if (pathname === "/login" || pathname === "/signup") {
    return;
  }
  const next = encodeURIComponent(`${pathname}${search}`);
  window.location.assign(`/login?next=${next}`);
}

export const api = {
  get<T>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<T> {
    return request<T>("GET", path, { query, signal });
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("POST", path, { body });
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>("PATCH", path, { body });
  },
  delete(path: string): Promise<void> {
    return request<undefined>("DELETE", path);
  },
};
