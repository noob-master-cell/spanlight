import { z } from "zod";

import type { FaultParams, FaultParamsByScenario, FaultScenario } from "@/lib/api";

/** One scenario as the picker shows it: a human title, the mono id, the §9.1 description. */
export interface ScenarioMeta {
  id: FaultScenario;
  title: string;
  description: string;
}

export const SCENARIOS: readonly ScenarioMeta[] = [
  { id: "auth_expired", title: "Auth expired", description: "The provider rejects the API key." },
  {
    id: "scope_denied",
    title: "Scope denied",
    description: "The key lacks permission for the request.",
  },
  {
    id: "rate_limited",
    title: "Rate limited",
    description: "The provider returns 429 with Retry-After.",
  },
  {
    id: "unsupported_parameter",
    title: "Unsupported parameter",
    description: "The provider rejects one request parameter.",
  },
  {
    id: "provider_5xx",
    title: "Provider 5xx",
    description: "The provider fails with a server error.",
  },
  {
    id: "malformed_json",
    title: "Malformed JSON",
    description: "A 200 response with a cut-off JSON body.",
  },
  {
    id: "truncated_stream",
    title: "Truncated stream",
    description: "The stream stops before its end marker.",
  },
  { id: "slow_response", title: "Slow response", description: "The first byte arrives late." },
  { id: "timeout", title: "Timeout", description: "The provider never answers in time." },
];

/* ---------- Per-scenario parameters (backend spec §5.4) ---------- */

export const PROVIDER_5XX_STATUSES = [500, 502, 503, 529] as const;
export const UNSUPPORTED_PARAM_PATTERN = /^[a-z_][a-z0-9_.]*$/;

/** The parameter schemas mirror the server's: the same ranges, the same patterns. */
export const faultParamsSchemas = {
  auth_expired: z.object({}).strict(),
  scope_denied: z.object({}).strict(),
  rate_limited: z.object({ retry_after_s: z.number().int().min(1).max(3600) }).strict(),
  unsupported_parameter: z
    .object({ param: z.string().min(1).max(64).regex(UNSUPPORTED_PARAM_PATTERN) })
    .strict(),
  provider_5xx: z
    .object({ status: z.union([z.literal(500), z.literal(502), z.literal(503), z.literal(529)]) })
    .strict(),
  malformed_json: z.object({ keep_fraction: z.number().min(0.1).max(0.9) }).strict(),
  truncated_stream: z.object({ after_chunks: z.number().int().min(1).max(100) }).strict(),
  slow_response: z.object({ delay_ms: z.number().int().min(100).max(60_000) }).strict(),
  timeout: z.object({ hold_ms: z.number().int().min(1000).max(120_000) }).strict(),
} satisfies Record<FaultScenario, z.ZodType>;

/** The server's defaults, filled in so the form always starts with real values. */
export const FAULT_PARAM_DEFAULTS: { [S in FaultScenario]: Required<FaultParamsByScenario[S]> } = {
  auth_expired: {},
  scope_denied: {},
  rate_limited: { retry_after_s: 2 },
  unsupported_parameter: { param: "temperature" },
  provider_5xx: { status: 500 },
  malformed_json: { keep_fraction: 0.6 },
  truncated_stream: { after_chunks: 3 },
  slow_response: { delay_ms: 5000 },
  timeout: { hold_ms: 30_000 },
};

/** How a parameter is edited. The form keeps every value as text and parses on submit. */
export type ParamField =
  | {
      kind: "number";
      name: string;
      label: string;
      hint: string;
      min: number;
      max: number;
      integer: boolean;
    }
  | { kind: "text"; name: string; label: string; hint: string; maxLength: number }
  | { kind: "choice"; name: string; label: string; hint: string; options: readonly number[] };

export const SCENARIO_FIELDS: Record<FaultScenario, readonly ParamField[]> = {
  auth_expired: [],
  scope_denied: [],
  rate_limited: [
    {
      kind: "number",
      name: "retry_after_s",
      label: "Retry-After (seconds)",
      hint: "1 to 3,600. Sent in the Retry-After header with the 429.",
      min: 1,
      max: 3600,
      integer: true,
    },
  ],
  unsupported_parameter: [
    {
      kind: "text",
      name: "param",
      label: "Parameter name",
      hint: "Lowercase letters, digits, underscores and dots, up to 64 characters.",
      maxLength: 64,
    },
  ],
  provider_5xx: [
    {
      kind: "choice",
      name: "status",
      label: "Status",
      hint: "The status the gateway returns instead of calling the provider.",
      options: PROVIDER_5XX_STATUSES,
    },
  ],
  malformed_json: [
    {
      kind: "number",
      name: "keep_fraction",
      label: "Share of the body kept",
      hint: "0.1 to 0.9. The rest of the JSON body is cut off. Non-streaming calls only.",
      min: 0.1,
      max: 0.9,
      integer: false,
    },
  ],
  truncated_stream: [
    {
      kind: "number",
      name: "after_chunks",
      label: "Frames before the cut",
      hint: "1 to 100. The connection closes after this many frames. Streaming calls only.",
      min: 1,
      max: 100,
      integer: true,
    },
  ],
  slow_response: [
    {
      kind: "number",
      name: "delay_ms",
      label: "First-byte delay (ms)",
      hint: "100 to 60,000. The response itself is unchanged.",
      min: 100,
      max: 60_000,
      integer: true,
    },
  ],
  timeout: [
    {
      kind: "number",
      name: "hold_ms",
      label: "Hold time (ms)",
      hint: "1,000 to 120,000. Capped by the time left in the route's budget.",
      min: 1000,
      max: 120_000,
      integer: true,
    },
  ],
};

export type ParamText = Record<string, string>;

/** The text the form starts with for a scenario: its defaults. */
export function defaultParamText(scenario: FaultScenario): ParamText {
  return paramsToText(FAULT_PARAM_DEFAULTS[scenario]);
}

/** Stored parameters as form text. A missing value falls back to the scenario's default. */
export function storedParamText(scenario: FaultScenario, stored: FaultParams): ParamText {
  return paramsToText({ ...FAULT_PARAM_DEFAULTS[scenario], ...stored });
}

function paramsToText(params: object): ParamText {
  return Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)]));
}

export type ParamsResult =
  { ok: true; params: FaultParams } | { ok: false; errors: Record<string, string> };

/** The message under a field that failed the scenario's schema. */
function fieldMessage(field: ParamField): string {
  switch (field.kind) {
    case "number": {
      const range = `${field.min.toLocaleString("en-US")} to ${field.max.toLocaleString("en-US")}`;
      return field.integer
        ? `Enter a whole number from ${range}.`
        : `Enter a number from ${range}.`;
    }
    case "text":
      return "Use lowercase letters, digits, underscores and dots, starting with a letter or underscore.";
    case "choice":
      return `Pick one of ${field.options.join(", ")}.`;
  }
}

/** Reads one field's text into the value its schema expects; NaN for an empty number. */
function parseField(field: ParamField, text: string): string | number {
  if (field.kind === "text") {
    return text.trim();
  }
  return text.trim() === "" ? Number.NaN : Number(normalizeDecimal(text));
}

/** Validates the form text against the scenario's schema and returns the API params. */
export function parseParams(scenario: FaultScenario, text: ParamText): ParamsResult {
  const fields = SCENARIO_FIELDS[scenario];
  const raw = Object.fromEntries(
    fields.map((field) => [field.name, parseField(field, text[field.name] ?? "")]),
  );
  const parsed = faultParamsSchemas[scenario].safeParse(raw);
  if (parsed.success) {
    return { ok: true, params: parsed.data as FaultParams };
  }
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const name = String(issue.path[0] ?? "");
    const field = fields.find((candidate) => candidate.name === name);
    if (field && !(name in errors)) {
      errors[name] = fieldMessage(field);
    }
  }
  return { ok: false, errors };
}

/* ---------- Probability ---------- */

/** A percent as typed (one decimal) to the API's value, three decimals. Null if out of range. */
export function percentToProbability(percent: number): number | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return null;
  }
  return Math.round(percent * 10) / 1000;
}

/** The API's probability as a percent with at most one decimal. */
export function probabilityToPercent(probability: number): number {
  return Math.round(probability * 1000) / 10;
}

/** "25 %" or "0.5 %": whole percents without a decimal. */
export function formatProbability(probability: number): string {
  return `${probabilityToPercent(probability)} %`;
}

/** A decimal comma (a phone keyboard in some locales) reads as a point. */
function normalizeDecimal(text: string): string {
  return text.trim().replace(",", ".");
}

export type PercentCheck =
  { ok: true; percent: number } | { ok: false; reason: "format" | "range" | "decimals" };

/**
 * Text typed into the percent input. At most one decimal: "0.15" is refused, not rounded, so the
 * saved value is always what the field shows.
 */
export function checkPercentText(text: string): PercentCheck {
  const normalized = normalizeDecimal(text);
  if (!/^\d*\.?\d*$/.test(normalized) || normalized === "" || normalized === ".") {
    return { ok: false, reason: "format" };
  }
  if (/\.\d{2,}/.test(normalized)) {
    return { ok: false, reason: "decimals" };
  }
  const percent = Number(normalized);
  return percent > 100 ? { ok: false, reason: "range" } : { ok: true, percent };
}

/** The percent in the text, or null when it isn't a valid one. */
export function parsePercentText(text: string): number | null {
  const check = checkPercentText(text);
  return check.ok ? check.percent : null;
}
