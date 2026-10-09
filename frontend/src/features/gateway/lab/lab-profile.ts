import { z } from "zod";

import type { FaultProfile, GatewayKey } from "@/lib/api";
import { toLocalInputValue } from "@/lib/time-range";

import { checkPercentText } from "./scenario-params";

export const PROFILE_NAME_MAX_LENGTH = 100;
export const PRODUCTION_KEY_REASON = "Production keys can't run faults";

const HOUR_MS = 3_600_000;

const PERCENT_MESSAGES = {
  format: "Enter a percent from 0 to 100.",
  range: "Enter a percent from 0 to 100.",
  decimals: "Use one decimal place.",
} as const;

/** What a profile is doing right now. Expiry wins over the switch: an expired profile is inert. */
export type ProfileStatus = "active" | "disabled" | "expired";

export function profileStatus(profile: FaultProfile, now: Date = new Date()): ProfileStatus {
  if (profile.expires_at !== null && new Date(profile.expires_at) <= now) {
    return "expired";
  }
  return profile.enabled ? "active" : "disabled";
}

/** Keys a profile may be attached to: not revoked. Production ones are listed but disabled. */
export function attachableKeys(keys: readonly GatewayKey[]): GatewayKey[] {
  return keys.filter((key) => key.revoked_at === null);
}

/** The new-profile default: 24 hours from now, so a forgotten profile stops by itself. */
export function defaultExpiryInput(now: Date = new Date()): string {
  return toLocalInputValue(new Date(now.getTime() + 24 * HOUR_MS).toISOString());
}

/** Local datetime text to an ISO instant; null when it is empty or not a date. */
export function expiryInputToIso(text: string): string | null {
  if (text.trim() === "") {
    return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface ProfileFormValues {
  name: string;
  /** Percent as typed, one decimal at most. */
  percent: string;
  enabled: boolean;
  /** `datetime-local` text; empty keeps the profile running with no end. */
  expiresAt: string;
}

/**
 * Name, probability and expiry. `unchangedExpiry` is the stored value of an edited profile: it is
 * left alone when it still reads the same, even if it has passed, so an expired profile can be
 * renamed without picking a new date.
 */
export function profileFormSchema(unchangedExpiry: string | null, now: Date = new Date()) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a name for this profile.")
      .max(PROFILE_NAME_MAX_LENGTH, `Use ${PROFILE_NAME_MAX_LENGTH} characters or fewer.`),
    percent: z.string().superRefine((text, context) => {
      const check = checkPercentText(text);
      if (!check.ok) {
        context.addIssue({ code: "custom", message: PERCENT_MESSAGES[check.reason] });
      }
    }),
    enabled: z.boolean(),
    expiresAt: z.string().refine((text) => {
      if (text === unchangedExpiry || text.trim() === "") {
        return true;
      }
      const iso = expiryInputToIso(text);
      return iso !== null && new Date(iso) > now;
    }, "Pick a time in the future, or clear the field."),
  });
}
