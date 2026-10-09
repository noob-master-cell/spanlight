const STORAGE_KEY = "spanlight-last-project";

export interface LastProject {
  orgId: string;
  projectId: string;
}

export function readLastProject(): LastProject | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "orgId" in parsed &&
      "projectId" in parsed &&
      typeof parsed.orgId === "string" &&
      typeof parsed.projectId === "string"
    ) {
      return { orgId: parsed.orgId, projectId: parsed.projectId };
    }
  } catch {
    // Corrupt or unavailable storage: behave as if nothing was stored.
  }
  return null;
}

export function writeLastProject(value: LastProject): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Not persisting the last project is harmless.
  }
}

/**
 * Forgets the remembered project when it was deleted, or lives in a deleted organization. A
 * remembered project that is something else is left alone.
 */
export function clearLastProject(deleted: { orgId?: string; projectId?: string }): void {
  const last = readLastProject();
  if (!last) {
    return;
  }
  const inDeletedProject = deleted.projectId !== undefined && last.projectId === deleted.projectId;
  const inDeletedOrg = deleted.orgId !== undefined && last.orgId === deleted.orgId;
  if (!inDeletedProject && !inDeletedOrg) {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Unavailable storage holds nothing to forget.
  }
}
