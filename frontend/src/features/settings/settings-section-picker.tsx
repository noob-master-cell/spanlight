import { useLocation } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { SettingsNavGroups } from "./settings-nav-groups";
import { activeSettingsItem, type SettingsNavGroup } from "./settings-nav-items";

interface SettingsSectionPickerProps {
  groups: readonly SettingsNavGroup[];
}

/**
 * The settings navigation below 768 px (Figma "Settings/Section picker (mobile)"): a pill that names
 * the current section and opens the grouped nav in a bottom sheet.
 */
export function SettingsSectionPicker({ groups }: SettingsSectionPickerProps) {
  const [open, setOpen] = useState(false);
  const pathname = useLocation({ select: (location) => location.pathname });
  const current = activeSettingsItem(pathname, groups);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex h-11 w-full items-center gap-2 rounded-full border border-input bg-surface pr-3.5 pl-4 text-left md:hidden"
        >
          <span className="text-label font-medium text-muted-foreground">Section</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {current?.label ?? "Settings"}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="top-auto bottom-2 max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none translate-y-0 overflow-y-auto rounded-card p-5">
        <div className="flex flex-col gap-1.5 pr-8">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Choose a section.</DialogDescription>
        </div>
        <nav aria-label="Settings sections">
          <SettingsNavGroups
            groups={groups}
            onNavigate={() => {
              setOpen(false);
            }}
          />
        </nav>
      </DialogContent>
    </Dialog>
  );
}
