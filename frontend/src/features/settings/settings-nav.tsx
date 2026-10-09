import { useMemo } from "react";

import { useCurrentRole } from "@/features/shell";

import { SettingsNavGroups } from "./settings-nav-groups";
import { visibleSettingsNav } from "./settings-nav-items";
import { SettingsSectionPicker } from "./settings-section-picker";

/**
 * Settings sub-navigation (Figma "Settings/Nav v2"): a grouped column of pills beside the content
 * from 768 px, and a section picker that opens the same groups in a sheet below that. Pages show
 * only to roles that can read them.
 */
export function SettingsNav() {
  const role = useCurrentRole();
  const groups = useMemo(() => visibleSettingsNav(role), [role]);

  return (
    <>
      <SettingsSectionPicker groups={groups} />
      <nav aria-label="Settings" className="hidden w-44 shrink-0 md:block">
        <SettingsNavGroups groups={groups} />
      </nav>
    </>
  );
}
