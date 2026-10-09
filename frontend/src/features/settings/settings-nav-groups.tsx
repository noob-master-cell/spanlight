import { Link } from "@tanstack/react-router";
import { useId } from "react";

import { useProjectParams } from "@/features/shell";

import type { SettingsNavGroup } from "./settings-nav-items";

interface SettingsNavGroupsProps {
  groups: readonly SettingsNavGroup[];
  /** Called after a link is followed, e.g. to close the mobile sheet. */
  onNavigate?: () => void;
}

/**
 * The grouped pill list (Figma "Settings/Nav v2"): an overline heading per group, then one pill
 * per page. The active pill is ink with a lime dot. Used in the desktop column and the mobile sheet.
 */
export function SettingsNavGroups({ groups, onNavigate }: SettingsNavGroupsProps) {
  return (
    <ul className="flex flex-col gap-5">
      {groups.map((group) => (
        <li key={group.id}>
          <NavGroup group={group} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  );
}

function NavGroup({
  group,
  onNavigate,
}: {
  group: SettingsNavGroup;
  onNavigate: (() => void) | undefined;
}) {
  const params = useProjectParams();
  const headingId = useId();

  return (
    <>
      <p id={headingId} className="px-4 pb-1.5 text-overline text-subtle-foreground uppercase">
        {group.label}
      </p>
      <ul aria-labelledby={headingId} className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              params={params}
              onClick={onNavigate}
              className="group flex h-10 items-center justify-between gap-3 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground data-[status=active]:bg-ink data-[status=active]:font-semibold data-[status=active]:text-ink-foreground"
              activeProps={{ "aria-current": "page" }}
            >
              {item.label}
              <span
                aria-hidden
                className="hidden size-1.5 shrink-0 rounded-full bg-lime group-data-[status=active]:block dark:bg-lime-foreground"
              />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
