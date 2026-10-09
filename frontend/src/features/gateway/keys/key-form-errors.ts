import type { UseFormSetError } from "react-hook-form";

import { isApiError } from "@/lib/api";
import { applyMappedFieldErrors } from "@/lib/form-errors";

import { PRODUCTION_KEY_CODE } from "../environment";
import { DETACH_BEFORE_PRODUCTION, type KeyFormValues } from "./key-form";

type FormField = keyof KeyFormValues;

/** API body fields to the form field that shows them; `allowed_models.3` goes to its root. */
const FIELD_OF_API_FIELD: Record<string, FormField> = {
  name: "name",
  environment: "environment",
  route_id: "routeId",
  rpm_limit: "rpmLimit",
  tpm_limit: "tpmLimit",
  allowed_models: "allowedModels",
  default_tags: "defaultTags",
  cache_ttl_seconds: "cache",
  fault_profile_id: "faultProfileId",
};

const NO_DEFAULT_ROUTE_MESSAGE =
  "This project has no default route. Choose a route for this key, or make one the default.";

/**
 * Puts a failed save's problem on the field it is about: 422 field paths, the production-key
 * rule (on the environment, as the frame shows) and the missing default route (on the route).
 * Returns false when nothing could be placed, so the caller falls back to a toast.
 */
export function applyKeyProblem(error: unknown, setError: UseFormSetError<KeyFormValues>): boolean {
  if (!isApiError(error)) {
    return false;
  }
  if (error.code === PRODUCTION_KEY_CODE) {
    setError("environment", { type: "server", message: DETACH_BEFORE_PRODUCTION });
    return true;
  }
  if (error.code === "NO_DEFAULT_ROUTE") {
    setError("routeId", { type: "server", message: NO_DEFAULT_ROUTE_MESSAGE });
    return true;
  }
  return applyMappedFieldErrors(error, setError, FIELD_OF_API_FIELD);
}
