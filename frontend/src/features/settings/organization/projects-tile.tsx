import { Skeleton } from "@/components/ui/skeleton";
import type { Project } from "@/lib/api";

import { projectsHeading } from "../danger-copy";

interface ProjectsTileProps {
  /** Undefined while the list loads. */
  projects: readonly Project[] | undefined;
  /** The list couldn't be read: the dialog still works, it just names no projects. */
  failed: boolean;
}

/** The "3 PROJECTS" tile of the delete dialog: what goes with the organization (Figma). */
export function ProjectsTile({ projects, failed }: ProjectsTileProps) {
  if (failed || projects?.length === 0) {
    return null;
  }
  if (!projects) {
    return (
      <Skeleton role="status" aria-label="Loading projects" className="h-[129px] rounded-tile" />
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-tile bg-surface-muted px-4 py-3.5">
      <p className="text-overline text-subtle-foreground uppercase">
        {projectsHeading(projects.length)}
      </p>
      <ul
        tabIndex={0}
        aria-label="Projects that will be deleted"
        className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md"
      >
        {projects.map((project) => (
          <li key={project.id} className="flex items-center gap-2.5 text-sm font-medium">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
            <span className="min-w-0 truncate">{project.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
