import { PageHeader } from "@/components/page-header";
import { AccountShell } from "@/features/shell";

import { SecurityPage } from "./security-page";

/**
 * `/account/security`: the Security page with no project around it. Where an organization requires
 * two-factor authentication and the person has none, every project answers `403
 * TWO_FACTOR_REQUIRED`, so this is the one page they can always reach to turn it on.
 */
export function AccountSecurityPage() {
  return (
    <AccountShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Security"
          description="Two-factor authentication, the ways you sign in and the devices signed in to your account."
        />
        <SecurityPage />
      </div>
    </AccountShell>
  );
}
