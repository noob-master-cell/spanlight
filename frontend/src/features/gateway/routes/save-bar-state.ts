import { fieldLabel, joinWords } from "./config-labels";

export interface SaveBarState {
  tone: "pending" | "danger";
  title: string;
  detail: string;
  submitLabel: string;
  submitDisabled: boolean;
  cancelLabel: string;
}

interface SaveBarInput {
  /** Null for a route that is not created yet. */
  version: number | null;
  routeName: string;
  dirty: boolean;
  /** Paths of the fields with an error (`errorPaths`). */
  errors: readonly string[];
  /** The newer version a `409 ROUTE_VERSION_CONFLICT` reported, or null. */
  conflictVersion: number | null;
}

/**
 * What the sticky save bar says (Figma "Save bar" of the route editor), or null when there is
 * nothing to save. Fields with errors win over the plain "Unsaved changes", and a version
 * conflict wins over both, since saving can't succeed until the person reloads.
 */
export function saveBarState(input: SaveBarInput): SaveBarState | null {
  const isNew = input.version === null;
  const next = isNew ? 1 : (input.version ?? 0) + 1;
  const goal = isNew ? `create ${input.routeName}` : `save version ${next}`;

  if (input.conflictVersion !== null) {
    return {
      tone: "pending",
      title: "Unsaved changes",
      detail: `Version ${input.conflictVersion} is newer than your copy. Reload latest before saving.`,
      submitLabel: "Save changes",
      submitDisabled: true,
      cancelLabel: "Discard",
    };
  }
  if (input.errors.length > 0) {
    const count = input.errors.length;
    const labels = [...new Set(input.errors.map(fieldLabel))];
    return {
      tone: "danger",
      title: count === 1 ? "1 field needs a fix" : `${count} fields need a fix`,
      detail: `${labels.length > 3 ? `${labels.slice(0, 3).join(", ")} and more` : joinWords(labels)}. Fix ${count === 1 ? "it" : "them"} to ${goal}.`,
      submitLabel: isNew ? "Create route" : "Save changes",
      submitDisabled: true,
      cancelLabel: isNew ? "Cancel" : "Discard",
    };
  }
  if (isNew) {
    return {
      tone: "pending",
      title: "New route",
      detail: `Creating ${input.routeName} saves version 1.`,
      submitLabel: "Create route",
      submitDisabled: false,
      cancelLabel: "Cancel",
    };
  }
  if (!input.dirty) {
    return null;
  }
  return {
    tone: "pending",
    title: "Unsaved changes",
    detail: `You're editing version ${input.version ?? ""}. Saving creates version ${next}.`,
    submitLabel: "Save changes",
    submitDisabled: false,
    cancelLabel: "Discard",
  };
}
