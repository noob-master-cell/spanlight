import { useCallback, useState } from "react";
import type { UseFormSetError } from "react-hook-form";

import type { KeyFormValues } from "./key-form";

export type DraftField = "allowedModels" | "defaultTags";

/**
 * What the chip fields still hold in their text box. A value left there (a rejected one, or one
 * not yet added with Enter) is not part of the form, so Save must not carry on without saying so.
 */
export function useDraftProblems() {
  const [problems, setProblems] = useState<Partial<Record<DraftField, string>>>({});

  const report = useCallback(
    (field: DraftField) => (message: string | null) => {
      setProblems((current) => {
        if ((current[field] ?? null) === message) {
          return current;
        }
        const next = { ...current };
        if (message === null) {
          const { [field]: _removed, ...rest } = next;
          return rest;
        }
        next[field] = message;
        return next;
      });
    },
    [],
  );

  /** Puts each pending problem on its field. Returns true when there was one: do not save. */
  function blockSave(setError: UseFormSetError<KeyFormValues>): boolean {
    const entries = Object.entries(problems) as [DraftField, string][];
    for (const [field, message] of entries) {
      setError(field, { type: "draft", message });
    }
    return entries.length > 0;
  }

  return { report, blockSave };
}
