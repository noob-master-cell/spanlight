import { errorMessage, isApiError } from "@/lib/api";

import { MAX_MUTE_DAYS, REASON_MAX_LENGTH } from "./mute-form";

/** Plain wording for the errors an insight action can return; anything else uses the API's. */
export function actionErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === "INVALID_TRANSITION") {
      return "That action no longer applies: the insight's status changed. The page now shows its latest status.";
    }
    if (error.code === "INVALID_MUTE") {
      return `The mute was not accepted. Choose a date within ${MAX_MUTE_DAYS} days and give a reason of up to ${REASON_MAX_LENGTH} characters.`;
    }
  }
  return errorMessage(error);
}
