import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useProjectParams } from "@/features/shell/project-context";

interface SettingsNavItem {
  label: string;
  to:
    | "/$orgId/$projectId/settings/project"
    | "/$orgId/$projectId/settings/keys"
    | "/$orgId/$projectId/settings/members"
    | "/$orgId/$projectId/settings/audit"
    | "/$orgId/$projectId/settings/account";
}

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { label: "Project", to: "/$orgId/$projectId/settings/project" },
  { label: "API keys", to: "/$orgId/$projectId/settings/keys" },
  { label: "Members", to: "/$orgId/$projectId/settings/members" },
  { label: "Audit log", to: "/$orgId/$projectId/settings/audit" },
  { label: "Account", to: "/$orgId/$projectId/settings/account" },
];

/**
 * Settings sub-navigation (Figma "Settings/Nav pill"): a column of pills beside the content on
 * wide screens, a horizontally scrolling row of pills on phones. The active pill is ink with
 * a lime dot.
 */
export function SettingsNav() {
  const params = useProjectParams();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navRef = useRef<HTMLElement>(null);

  // On phones the pills scroll sideways: keep the active one in view after navigating.
  useEffect(() => {
    const nav = navRef.current;
    if (nav === null || nav.scrollWidth <= nav.clientWidth) {
      return;
    }
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      const offset = active.getBoundingClientRect().left - nav.getBoundingClientRect().left;
      nav.scrollLeft += offset - (nav.clientWidth - active.offsetWidth) / 2;
    }
  }, [pathname]);

  return (
    <nav
      ref={navRef}
      aria-label="Settings"
      className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0 xl:w-44 xl:shrink-0 xl:overflow-visible"
    >
      <ul className="flex w-max gap-1 xl:w-full xl:flex-col">
        {SETTINGS_NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              params={params}
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
    </nav>
  );
}
