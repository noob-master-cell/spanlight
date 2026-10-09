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

import { activeGatewayItem, GATEWAY_NAV_ITEMS, type GatewayNavItem } from "./gateway-nav-items";

const PILL_CLASSES =
  "group flex h-9 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground data-[status=active]:bg-ink data-[status=active]:font-semibold data-[status=active]:text-ink-foreground";

const DOT_CLASSES =
  "hidden size-1.5 shrink-0 rounded-full bg-lime group-data-[status=active]:block dark:bg-lime-foreground";

/**
 * Gateway sub-navigation (Figma "Gateway/Sub-nav"): a card-shaped pill row from 768 px, and below
 * that the same section picker as Settings, a pill naming the current page that opens the list in a
 * bottom sheet. The active pill is ink with a lime dot.
 */
export function GatewayNav() {
  return (
    <>
      <GatewaySectionPicker />
      <nav aria-label="Gateway" className="hidden md:block">
        <ul className="flex w-fit items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-card">
          {GATEWAY_NAV_ITEMS.map((item) => (
            <GatewayNavLink key={item.to} item={item} />
          ))}
        </ul>
      </nav>
    </>
  );
}

function GatewayNavLink({ item, onNavigate }: { item: GatewayNavItem; onNavigate?: () => void }) {
  const params = useProjectParams();
  return (
    <li>
      <Link
        to={item.to}
        params={params}
        activeOptions={{ exact: item.exact }}
        onClick={onNavigate}
        className={PILL_CLASSES}
        activeProps={{ "aria-current": "page" }}
      >
        {item.label}
        <span aria-hidden className={DOT_CLASSES} />
      </Link>
    </li>
  );
}

function GatewaySectionPicker() {
  const [open, setOpen] = useState(false);
  const pathname = useLocation({ select: (location) => location.pathname });
  const current = activeGatewayItem(pathname);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex h-11 w-full items-center gap-2 rounded-full border border-input bg-surface pr-3.5 pl-4 text-left md:hidden"
        >
          <span className="text-label font-medium text-muted-foreground">Section</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {current?.label ?? "Gateway"}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="top-auto bottom-2 max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none translate-y-0 overflow-y-auto rounded-card p-5">
        <div className="flex flex-col gap-1.5 pr-8">
          <DialogTitle>Gateway</DialogTitle>
          <DialogDescription>Choose a section.</DialogDescription>
        </div>
        <nav aria-label="Gateway sections">
          <ul className="flex flex-col gap-0.5">
            {GATEWAY_NAV_ITEMS.map((item) => (
              <GatewayNavLink
                key={item.to}
                item={item}
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
