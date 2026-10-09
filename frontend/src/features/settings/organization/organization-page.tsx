import { useCurrentOrg, usePermission } from "@/features/shell";

import { OrgDangerZone } from "./danger-zone";
import { OrganizationForm } from "./organization-form";
import { OrgSecurityCard } from "./org-security-card";

/**
 * Settings › Organization: rename, the two-factor requirement, and deleting the organization.
 * What each role sees follows the permissions the server enforces, and the public demo
 * organization is read-only for everyone, with no danger zone.
 */
export function OrganizationPage() {
  const org = useCurrentOrg();
  const canRename = usePermission("org:update");
  const canSecure = usePermission("org:security");
  const canDelete = usePermission("org:delete");

  // The organization leaves `/me` the moment it is deleted, while the page is still on screen.
  if (!org) {
    return null;
  }
  const editable = !org.is_demo;

  return (
    <div className="flex flex-col gap-5">
      <OrganizationForm
        key={org.id}
        org={org}
        canEdit={editable && canRename}
        canSecure={editable && canSecure}
      />
      <OrgSecurityCard org={org} canChange={editable && canSecure} />
      {editable && canDelete ? <OrgDangerZone org={org} /> : null}
    </div>
  );
}
