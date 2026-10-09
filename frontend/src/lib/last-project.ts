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
