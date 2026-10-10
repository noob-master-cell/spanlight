import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useProjectParams } from "@/features/shell";

interface AlertsTab {
  label: string;
  to: "/$orgId/$projectId/alerts" | "/$orgId/$projectId/alerts/channels";
  /** Rules sits at `/alerts`, the parent of every alerts URL: only an exact match is active. */
  exact: boolean;
}

/** Spec §11: Alerts sub-tabs Rules · Channels. */
const ALERTS_TABS: readonly AlertsTab[] = [
  { label: "Rules", to: "/$orgId/$projectId/alerts", exact: true },
  { label: "Channels", to: "/$orgId/$projectId/alerts/channels", exact: false },
];

const PILL_CLASSES =
  "group flex h-9 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground data-[status=active]:bg-ink data-[status=active]:font-semibold data-[status=active]:text-ink-foreground";

const DOT_CLASSES =
  "hidden size-1.5 shrink-0 rounded-full bg-lime group-data-[status=active]:block dark:bg-lime-foreground";

/**
 * Figma "Alerts/Sub-nav" (built from the Gateway sub-nav): a card-shaped pill row from 768 px,
 * and below that the Settings-style section picker that opens the tabs in a bottom sheet.
 */
export function AlertsHeaderTabs() {
  return (
    <>
      <AlertsSectionPicker />
      <nav aria-label="Alerts" className="hidden md:block">
        <ul className="flex w-fit items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-card">
          {ALERTS_TABS.map((tab) => (
            <AlertsTabLink key={tab.to} tab={tab} />
          ))}
        </ul>
      </nav>
    </>
  );
}

function AlertsTabLink({ tab, onNavigate }: { tab: AlertsTab; onNavigate?: () => void }) {
  const params = useProjectParams();
  return (
    <li>
      <Link
        to={tab.to}
        params={params}
        activeOptions={{ exact: tab.exact }}
        onClick={onNavigate}
        className={PILL_CLASSES}
        activeProps={{ "aria-current": "page" }}
      >
        {tab.label}
        <span aria-hidden className={DOT_CLASSES} />
      </Link>
    </li>
  );
}

function AlertsSectionPicker() {
  const [open, setOpen] = useState(false);
  const pathname = useLocation({ select: (location) => location.pathname });
  const current = /\/alerts\/channels\/?$/.test(pathname) ? "Channels" : "Rules";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex h-11 w-full items-center gap-2 rounded-full border border-input bg-surface pr-3.5 pl-4 text-left md:hidden"
        >
          <span className="text-label font-medium text-muted-foreground">Section</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {current}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="top-auto bottom-2 max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none translate-y-0 overflow-y-auto rounded-card p-5">
        <div className="flex flex-col gap-1.5 pr-8">
          <DialogTitle>Alerts</DialogTitle>
          <DialogDescription>Choose a section.</DialogDescription>
        </div>
        <nav aria-label="Alerts sections">
          <ul className="flex flex-col gap-0.5">
            {ALERTS_TABS.map((tab) => (
              <AlertsTabLink
                key={tab.to}
                tab={tab}
                onNavigate={() => {
                  setOpen(false);
                }}
              />
            ))}
          </ul>
        </nav>
      </DialogContent>
    </Dialog>
  );
}
