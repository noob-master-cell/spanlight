import { z } from "zod";

import type { Budget, BudgetInput, BudgetScope, BudgetUpdate } from "@/lib/api";

/*
 * The budget dialog's form. The bounds mirror the server's (`budgets/schemas.py`, migration 0304):
 * names of 1 to 80 characters, an amount above 0 with at most 4 decimals and 10 whole digits, a
 * scope value of at most 200 characters, at most 10 channels.
 */

export const BUDGET_NAME_MAX_LENGTH = 80;
export const SCOPE_ID_MAX_LENGTH = 200;
export const MAX_BUDGET_CHANNELS = 10;

export const SCOPES: readonly BudgetScope[] = ["project", "gateway_key", "user", "model"];

/** Spec §11.1 action hints. */
export const ACTION_HINTS = {
  block:
    "Gateway calls in this scope get a 402 error until the period resets. Traces sent with the SDK are never blocked.",
  notify: "Sends an alert; nothing is blocked.",
} as const;

export interface BudgetFormValues {
  name: string;
  scope: BudgetScope;
  /** Each scope keeps its own value, so switching tabs never loses what was typed. */
  gatewayKeyId: string;
  userId: string;
  model: string;
  period: "daily" | "monthly";
  /** Dollars as typed, e.g. "50.00". Sent as a decimal string, never parsed for logic. */
  amount: string;
  action: "notify" | "block";
  channelIds: string[];
}

/**
 * Why the typed amount can't be saved, or null. Accepts "50", "50.", ".5" and "50.25"; at most
 * 10 whole digits and 4 decimals (numeric(14,4)), above 0.
 */
export function amountProblem(amount: string): string | null {
  if (amount === "" || amount === ".") {
    return "Enter an amount greater than 0.";
  }
  const match = /^(\d*)\.?(\d*)$/.exec(amount);
  if (!match) {
    return "Enter the amount as a number, for example 50.00.";
  }
  const [, whole = "", fraction = ""] = match;
  if (fraction.length > 4) {
    return "Use at most 4 decimal places.";
  }
  if (whole.replace(/^0+/, "").length > 10) {
    return "Use an amount below $10,000,000,000.";
  }
  return /[1-9]/.test(amount) ? null : "Enter an amount greater than 0.";
}

/** "50." → "50", ".5" → "0.5": the decimal string the server parses. */
export function normalizeAmount(amount: string): string {
  const trimmed = amount.endsWith(".") ? amount.slice(0, -1) : amount;
  return trimmed.startsWith(".") ? `0${trimmed}` : trimmed;
}

const scopeValue = z
  .string()
  .trim()
  .max(SCOPE_ID_MAX_LENGTH, `Use ${SCOPE_ID_MAX_LENGTH} characters or fewer.`);

export const budgetFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a name for this budget.")
      .max(BUDGET_NAME_MAX_LENGTH, `Use ${BUDGET_NAME_MAX_LENGTH} characters or fewer.`),
    scope: z.enum(["project", "gateway_key", "user", "model"]),
    gatewayKeyId: z.string(),
    userId: scopeValue,
    model: scopeValue,
    period: z.enum(["daily", "monthly"]),
    amount: z.string().trim(),
    action: z.enum(["notify", "block"]),
    channelIds: z
      .array(z.string())
      .max(MAX_BUDGET_CHANNELS, `Pick ${MAX_BUDGET_CHANNELS} or fewer.`),
  })
  .superRefine((values, context) => {
    const problem = amountProblem(values.amount);
    if (problem) {
      context.addIssue({ code: "custom", path: ["amount"], message: problem });
    }
    const missing: Partial<Record<BudgetScope, [keyof BudgetFormValues, string]>> = {
      gateway_key: ["gatewayKeyId", "Pick a gateway key."],
      user: ["userId", "Enter the end user ID."],
      model: ["model", "Enter the model name."],
    };
    const required = missing[values.scope];
    if (required && values[required[0]] === "") {
      context.addIssue({ code: "custom", path: [required[0]], message: required[1] });
    }
  });

export const EMPTY_BUDGET_VALUES: BudgetFormValues = {
  name: "",
  scope: "project",
  gatewayKeyId: "",
  userId: "",
  model: "",
  period: "monthly",
  amount: "",
  action: "notify",
  channelIds: [],
};

/** The form field that holds `scope_id` for a scope, or null for `project`. */
export function scopeField(scope: BudgetScope): "gatewayKeyId" | "userId" | "model" | null {
  return scope === "gateway_key"
    ? "gatewayKeyId"
    : scope === "user"
      ? "userId"
      : scope === "model"
        ? "model"
        : null;
}

/** "50.0000" → "50.00", "0.1250" → "0.125": the stored amount as a person would type it. */
export function displayAmount(amount: string): string {
  if (!amount.includes(".")) {
    return amount;
  }
  const [whole, fraction = ""] = amount.split(".");
  const trimmed = fraction.replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${trimmed}`;
}

export function valuesFromBudget(budget: Budget): BudgetFormValues {
  const values: BudgetFormValues = {
    ...EMPTY_BUDGET_VALUES,
    name: budget.name,
    scope: budget.scope,
    period: budget.period,
    amount: displayAmount(budget.amount_usd),
    action: budget.action,
    channelIds: [...budget.channel_ids],
  };
  const field = scopeField(budget.scope);
  if (field) {
    values[field] = budget.scope_id ?? "";
  }
  return values;
}

function scopeIdOf(values: BudgetFormValues): string | null {
  const field = scopeField(values.scope);
  return field ? values[field] : null;
}

export function toBudgetInput(values: BudgetFormValues): BudgetInput {
  return {
    name: values.name,
    scope: values.scope,
    scope_id: scopeIdOf(values),
    period: values.period,
    amount_usd: normalizeAmount(values.amount),
    action: values.action,
    channel_ids: values.channelIds,
  };
}

/** Only what changed. A new scope or scope value is sent as the pair the server requires. */
export function toBudgetUpdate(values: BudgetFormValues, budget: Budget): BudgetUpdate {
  const initial = valuesFromBudget(budget);
  const scopeId = scopeIdOf(values);
  const update: BudgetUpdate =
    values.scope !== budget.scope || scopeId !== budget.scope_id
      ? { scope: values.scope, scope_id: scopeId }
      : {};
  if (values.name !== initial.name) {
    update.name = values.name;
  }
  if (values.period !== initial.period) {
    update.period = values.period;
  }
  if (values.amount !== initial.amount) {
    update.amount_usd = normalizeAmount(values.amount);
  }
  if (values.action !== initial.action) {
    update.action = values.action;
  }
  if (values.channelIds.join(",") !== initial.channelIds.join(",")) {
    update.channel_ids = values.channelIds;
  }
  return update;
}

/** The form field a server field error belongs to, or null. */
export function budgetFieldOf(path: string, scope: BudgetScope): keyof BudgetFormValues | null {
  const root = path.split(".")[0];
  switch (root) {
    case "name":
      return "name";
    case "amount_usd":
      return "amount";
    case "channel_ids":
      return "channelIds";
    case "scope_id":
      return scopeField(scope);
    case "period":
    case "action":
    case "scope":
      return root;
    default:
      return null;
  }
}
