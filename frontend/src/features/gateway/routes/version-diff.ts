import type { RouteConfig, RouteVersion } from "@/lib/api";

import { FALLBACK_LABELS, fieldLabel, joinWords } from "./config-labels";
import { formValuesFromConfig, type RouteFormValues } from "./route-form";

/** One field that differs between two versions of a route's config. */
export interface FieldChange {
  /** The config path, e.g. `targets.0.weight`: shown as secondary mono text. */
  path: string;
  /** The friendly name, e.g. "Weight (target 1)". */
  label: string;
  /** The value in the older (compared) version; null when the field is absent there. */
  before: string | null;
  /** The value in the newer version; null when the field is absent there. */
  after: string | null;
}

/** Names a credential id; null when the credential is unknown (e.g. deleted). */
export type CredentialNamer = (credentialId: string) => string | null;

function formatMs(ms: number): string {
  return `${ms.toLocaleString("en-US")} ms`;
}

function formatAliases(rows: RouteFormValues["targets"][number]["aliases"]): string {
  if (rows.length === 0) {
    return "None";
  }
  return rows.map((row) => `${row.from} → ${row.to}`).join(", ");
}

/** Each config field as display text, keyed by its path. Defaults are filled in first. */
function flatten(config: RouteConfig, nameOf: CredentialNamer): Map<string, string> {
  const values = formValuesFromConfig(config);
  const fields = new Map<string, string>();
  values.targets.forEach((target, index) => {
    fields.set(
      `targets.${index}.credential_id`,
      nameOf(target.credential_id) ?? `Unknown credential ${target.credential_id.slice(0, 8)}`,
    );
    fields.set(`targets.${index}.weight`, String(target.weight));
    fields.set(`targets.${index}.model_aliases`, formatAliases(target.aliases));
  });
  fields.set("retry.max_attempts", String(values.retry.max_attempts));
  fields.set("retry.backoff_ms", formatMs(values.retry.backoff_ms));
  fields.set("retry.max_backoff_ms", formatMs(values.retry.max_backoff_ms));
  fields.set("retry.honour_retry_after", values.retry.honour_retry_after ? "On" : "Off");
  fields.set(
    "retry.on_statuses",
    values.retry.on_statuses.length === 0 ? "None" : values.retry.on_statuses.join(", "),
  );
  fields.set(
    "fallback.on",
    values.fallback.on.length === 0
      ? "Never"
      : values.fallback.on.map((condition) => FALLBACK_LABELS[condition]).join(", "),
  );
  fields.set("timeout_ms", formatMs(values.timeout_ms));
  return fields;
}

/**
 * The field-level difference between two configs, in config order. A target that exists on one
 * side only shows each of its fields with `null` on the other side.
 */
export function diffConfigs(
  before: RouteConfig,
  after: RouteConfig,
  nameOf: CredentialNamer,
): FieldChange[] {
  const beforeFields = flatten(before, nameOf);
  const afterFields = flatten(after, nameOf);
  const paths = [...new Set([...beforeFields.keys(), ...afterFields.keys()])].sort(comparePaths);
  const changes: FieldChange[] = [];
  for (const path of paths) {
    const from = beforeFields.get(path) ?? null;
    const to = afterFields.get(path) ?? null;
    if (from !== to) {
      changes.push({ path, label: fieldLabel(path), before: from, after: to });
    }
  }
  return changes;
}

const SECTION_ORDER = ["targets", "retry", "fallback", "timeout_ms"];

/** Config order: targets by index, then retry, fallback and the timeout. */
function comparePaths(a: string, b: string): number {
  const [sectionA = "", indexA = ""] = a.split(".");
  const [sectionB = "", indexB = ""] = b.split(".");
  const bySection = SECTION_ORDER.indexOf(sectionA) - SECTION_ORDER.indexOf(sectionB);
  if (bySection !== 0) {
    return bySection;
  }
  if (sectionA === "targets" && indexA !== indexB) {
    return Number(indexA) - Number(indexB);
  }
  return 0;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Short names for a version's summary line, without the target number. */
function shortName(path: string): string {
  const label = fieldLabel(path).replace(/ \(target \d+\)$/, "");
  return lowerFirst(label);
}

/**
 * The line under a version in the history: what it changed from the version before it, e.g.
 * "Changed weight (target 1)" or "Changed max attempts, retry on statuses and weight".
 * `versions` is newest first, as the API lists them.
 */
export function versionSummary(
  version: RouteVersion,
  versions: readonly RouteVersion[],
  nameOf: CredentialNamer,
): string {
  const previous = versions.find((candidate) => candidate.version === version.version - 1);
  if (version.version === 1) {
    return "Created the route";
  }
  if (!previous) {
    return `Version ${version.version}`;
  }
  const changes = diffConfigs(previous.config, version.config, nameOf);
  if (changes.length === 0) {
    return `Same settings as version ${previous.version}`;
  }
  if (changes.length === 1 && changes[0]) {
    return `Changed ${lowerFirst(changes[0].label)}`;
  }
  const names = [...new Set(changes.map((change) => shortName(change.path)))];
  if (names.length > 3) {
    return `Changed ${changes.length} fields`;
  }
  return `Changed ${joinWords(names)}`;
}
