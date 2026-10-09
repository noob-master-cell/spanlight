/** The choices in the audit log's Action and Actor filters. Pure functions only. */
import type { Member } from "@/lib/api";

import { AUDIT_FILTER_ACTIONS, auditActionLabel } from "./audit-actions";

export interface FilterOption {
  value: string;
  label: string;
}

/** Every action the server records, under the name the log shows for it. */
export function actionOptions(): FilterOption[] {
  return AUDIT_FILTER_ACTIONS.map((action) => ({
    value: action,
    label: auditActionLabel(action) ?? action,
  }));
}

/** The organization's current members; a person who has left cannot be picked, only read. */
export function actorOptions(members: readonly Member[]): FilterOption[] {
  return members.map((member) => ({
    value: member.user.id,
    label: member.user.name || member.user.email,
  }));
}

/**
 * Keeps a value that came from the URL selectable when it is not among the options (an action this
 * client does not list, a member who has left), so the pill never shows an empty selection.
 */
export function withSelected(
  options: FilterOption[],
  value: string | undefined,
  fallbackLabel: string,
): FilterOption[] {
  if (value === undefined || options.some((option) => option.value === value)) {
    return options;
  }
  return [{ value, label: fallbackLabel }, ...options];
}
