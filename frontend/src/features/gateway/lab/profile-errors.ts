import { errorMessage, isApiError } from "@/lib/api";

import { PRODUCTION_KEY_CODE } from "../environment";
import { PRODUCTION_KEY_REASON } from "./lab-profile";

export type ProfileFieldName = "name" | "percent" | "expiresAt";

/** The API's body field names, mapped to the form field that shows their 422 messages. */
export const PROFILE_FIELD_OF_API_FIELD = {
  name: "name",
  probability: "percent",
  expires_at: "expiresAt",
} as const satisfies Record<string, ProfileFieldName>;

/** Server field errors on `params.<name>`, by parameter name, for the scenario's fields. */
export function profileParamErrors(error: unknown): Record<string, string> {
  const params: Record<string, string> = {};
  if (isApiError(error)) {
    for (const { field, message } of error.fieldErrors) {
      if (field.startsWith("params.")) {
        params[field.slice("params.".length)] = message;
      }
    }
  }
  return params;
}

/** Why one key could not take or drop the profile, in words for the key's row. */
export function keyFailureMessage(error: unknown): string {
  if (isApiError(error) && error.code === PRODUCTION_KEY_CODE) {
    return PRODUCTION_KEY_REASON;
  }
  return errorMessage(error);
}

export function isProductionKeyFailure(error: unknown): boolean {
  return isApiError(error) && error.code === PRODUCTION_KEY_CODE;
}
