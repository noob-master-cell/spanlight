import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Callout } from "@/components/callout";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth";

import { orgsRequiringTwoFactor } from "./totp-flow";

/**
 * Shown to someone an organization has locked out until they turn on two-factor authentication
 * (`TWO_FACTOR_REQUIRED`): what is asked of them, and, once it is on, the way back in. A person who
 * already has two-factor on, or belongs to no organization that requires it, sees nothing.
 */
export function TwoFactorRequiredNotice() {
  const { memberships, totp_enabled: enabled } = useMe();
  const orgName = orgsRequiringTwoFactor(memberships)[0] ?? null;
  // Whether the page opened while they were blocked: only then is "Continue" worth offering.
  const [arrivedBlocked] = useState(() => orgName !== null && !enabled);

  if (orgName === null) {
    return null;
  }

  if (!enabled) {
    return (
      <Callout tone="warning">
        {orgName} requires two-factor authentication. Turn it on in Settings › Security to continue.
      </Callout>
    );
  }

  if (!arrivedBlocked) {
    return null;
  }

  return (
    <Callout
      tone="success"
      action={
        <Button asChild variant="primary" size="sm">
          <Link to="/">Continue</Link>
        </Button>
      }
    >
      Two-factor authentication is on. {orgName} is open to you again.
    </Callout>
  );
}
