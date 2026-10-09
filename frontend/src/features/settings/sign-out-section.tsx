import { Button } from "@/components/ui/button";
import { useSignOut } from "@/features/shell/use-sign-out";

import { SettingsSection } from "./settings-section";

export function SignOutSection() {
  const signOut = useSignOut();

  return (
    <SettingsSection
      title="Sign out"
      description="End your session on this device. Other sessions stay signed in."
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
