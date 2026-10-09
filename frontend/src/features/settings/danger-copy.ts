/** The sentence an organization's delete card and dialog share. `projectCount` is null until known. */
export function orgDeleteExplanation(orgName: string, projectCount: number | null): string {
  return `This permanently deletes ${orgName}, ${deletedProjects(projectCount)}, its members and its audit log. This can't be undone.`;
}

function deletedProjects(count: number | null): string {
  if (count === null) {
    return "its projects and their traces";
  }
  // One project reads "its traces"; every other count is the approved "{n} projects and their traces".
  return count === 1 ? "its 1 project and its traces" : `its ${count} projects and their traces`;
}

/** The sentence a project's delete card and dialog share. */
export function projectDeleteExplanation(projectName: string): string {
  return `This permanently deletes ${projectName}, its API keys and all of its traces. This can't be undone.`;
}

/** The heading of the organization dialog's list of projects: "3 projects". */
export function projectsHeading(count: number): string {
  return `${count} ${count === 1 ? "project" : "projects"}`;
}
