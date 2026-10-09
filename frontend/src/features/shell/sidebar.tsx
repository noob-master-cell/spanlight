import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

import { NAV_ITEMS } from "./nav-items";
import { useProjectParams } from "./project-context";
import { ProjectSwitcher } from "./project-switcher";
import { UserMenu } from "./user-menu";

interface SidebarProps {
  /** Called after a navigation link is followed (closes the mobile sheet). */
  onNavigate?: () => void;
  /** Rendered to the right of the logo, e.g. the mobile sheet's close and theme buttons. */
  headerAction?: ReactNode;
  className?: string;
}

/** Lime focus ring: the violet ring does not reach 3:1 on the near-black rail. */
const RAIL_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime";

/**
 * The floating dark rail (Figma "App/Rail"): logo, project switcher, pill navigation with a
 * lime active state, the "Connect your app" tile and the account tile.
 */
export function Sidebar({ onNavigate, headerAction, className }: SidebarProps) {
  const params = useProjectParams();

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-5 overflow-y-auto rounded-card bg-rail px-4 pt-5 pb-4 text-rail-foreground",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Logo tone="on-dark" />
        {headerAction}
      </div>

      <ProjectSwitcher variant="rail" />

      <nav aria-label="Main">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ label, to }) => (
            <li key={to}>
              <Link
                to={to}
                params={params}
                onClick={onNavigate}
                className={cn(
                  "flex h-11 items-center justify-between rounded-xl px-4 text-sm transition-colors duration-200",
                  RAIL_FOCUS,
                )}
                activeProps={{
                  className: "bg-lime font-bold text-lime-foreground",
                  "aria-current": "page",
                }}
                inactiveProps={{
                  className:
                    "font-medium text-rail-muted-foreground hover:bg-rail-tile hover:text-rail-foreground",
                }}
              >
                {({ isActive }) => (
                  <>
                    {label}
                    {isActive ? (
                      <span aria-hidden className="size-1.5 rounded-full bg-lime-foreground" />
                    ) : null}
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <Link
          to="/onboarding"
          search={{ org: params.orgId, project: params.projectId }}
          onClick={onNavigate}
          className={cn(
            "flex flex-col gap-1.5 rounded-[20px] bg-rail-tile p-4 transition-colors duration-200 hover:bg-rail-tile-hover",
            RAIL_FOCUS,
          )}
        >
          <span className="text-sm font-semibold text-rail-foreground">Connect your app</span>
          <span className="text-xs font-medium text-rail-subtle-foreground">
            Python SDK, OpenAI, Anthropic or OTLP.
          </span>
        </Link>
        <UserMenu />
      </div>
    </div>
  );
}
