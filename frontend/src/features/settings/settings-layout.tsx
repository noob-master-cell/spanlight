import { Outlet } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";

import { SettingsNav } from "./settings-nav";

export function SettingsLayout() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Manage this project, your organization's members and your account."
      />
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <SettingsNav />
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
