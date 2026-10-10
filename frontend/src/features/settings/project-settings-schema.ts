import { z } from "zod";

import type { Project, ProjectUpdate } from "@/lib/api";

export const PROJECT_NAME_MAX_LENGTH = 100;
export const RETENTION_MIN_DAYS = 1;
export const RETENTION_MAX_DAYS = 90;

export const projectNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a project name.")
    .max(PROJECT_NAME_MAX_LENGTH, `Use ${PROJECT_NAME_MAX_LENGTH} characters or fewer.`),
});

const wholeDaysMessage = "Enter a whole number of days.";

export const retentionSchema = z.object({
  retention_days: z
    .number({ error: wholeDaysMessage })
    .int(wholeDaysMessage)
    .min(RETENTION_MIN_DAYS, `Keep traces for at least ${RETENTION_MIN_DAYS} day.`)
    .max(RETENTION_MAX_DAYS, `Traces can be kept for at most ${RETENTION_MAX_DAYS} days.`),
});

export const capturePayloadsSchema = z.object({
  capture_payloads: z.boolean(),
});

export const weeklyDigestSchema = z.object({
  weekly_digest_enabled: z.boolean(),
});

/** The whole project form: the General, Data and Email cards share one "Save changes". */
export const projectSettingsSchema = z.object({
  ...projectNameSchema.shape,
  ...retentionSchema.shape,
  ...capturePayloadsSchema.shape,
  ...weeklyDigestSchema.shape,
});

export type ProjectSettingsValues = z.infer<typeof projectSettingsSchema>;

type EditableProjectFields = Required<ProjectUpdate>;

/**
 * The PATCH body for a settings form: only the fields whose value differs from
 * the saved project. An empty object means there is nothing to save.
 */
export function changedProjectFields(
  project: Pick<Project, keyof EditableProjectFields>,
  values: Partial<EditableProjectFields>,
): ProjectUpdate {
  const update: ProjectUpdate = {};
  if (values.name !== undefined && values.name.trim() !== project.name) {
    update.name = values.name.trim();
  }
  if (values.retention_days !== undefined && values.retention_days !== project.retention_days) {
    update.retention_days = values.retention_days;
  }
  if (
    values.capture_payloads !== undefined &&
    values.capture_payloads !== project.capture_payloads
  ) {
    update.capture_payloads = values.capture_payloads;
  }
  if (
    values.weekly_digest_enabled !== undefined &&
    values.weekly_digest_enabled !== (project.weekly_digest_enabled ?? true)
  ) {
    update.weekly_digest_enabled = values.weekly_digest_enabled;
  }
  return update;
}

export function isEmptyUpdate(update: ProjectUpdate): boolean {
  return Object.keys(update).length === 0;
}

function formatDays(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

/** The success toast for a saved update: specific for one field, general for several. */
export function projectSavedMessage(update: ProjectUpdate): string {
  const fields = Object.keys(update);
  if (fields.length !== 1) {
    return "Project settings saved.";
  }
  if (update.name !== undefined) {
    return "Project name saved.";
  }
  if (update.retention_days !== undefined) {
    return `Traces are now kept for ${formatDays(update.retention_days)}.`;
  }
  if (update.weekly_digest_enabled !== undefined) {
    return update.weekly_digest_enabled
      ? "Members will get the weekly digest."
      : "The weekly digest is turned off.";
  }
  return update.capture_payloads
    ? "Prompts and completions will be captured."
    : "Prompts and completions will no longer be captured.";
}
