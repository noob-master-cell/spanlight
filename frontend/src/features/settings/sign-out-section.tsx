import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useProjectParams, useSignOut } from "@/features/shell";

import { SettingsSection } from "./settings-section";

export function SignOutSection() {
  const signOut = useSignOut();
  const params = useProjectParams();

  return (
    <SettingsSection
      title="Sign out"
      description={
        <>
          End your session on this device. To see or end your other sessions, go to{" "}
          <Link
            to="/$orgId/$projectId/settings/security"
            params={params}
            className="rounded-xs font-semibold text-accent underline-offset-2 hover:underline"
          >
            Settings › Security
          </Link>
          .
        </>
      }
      actions={
        <Button
          variant="ghost"
          loading={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
        >
          Sign out
        </Button>
      }
    />
  );
}
