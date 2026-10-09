import { Link } from "@tanstack/react-router";

import { Callout } from "@/components/callout";
import { RowAction } from "@/components/tile-list";
import { useProjectParams } from "@/features/shell";

import { NOT_AVAILABLE_TITLE } from "../security/totp-flow";

/**
 * The answer to turning the requirement on when the server has no `CREDENTIALS_KEYS` (`409
 * NOT_CONFIGURED`). Shown only after that answer; nothing is known up front.
 */
export function NotConfiguredCallout() {
  return (
    <Callout tone="warning" title={NOT_AVAILABLE_TITLE} role="alert">
      An administrator needs to set CREDENTIALS_KEYS, the key Spanlight uses to encrypt
      authenticator secrets. Until then, two-factor authentication can't be required.
    </Callout>
  );
}

interface EnableOwnTwoFactorCalloutProps {
  /** The server just answered `409 TWO_FACTOR_NOT_ENABLED`: announce it. Otherwise it was there from the start. */
  answered: boolean;
}

/**
 * An owner without two-factor authentication can't require it of others (`409
 * TWO_FACTOR_NOT_ENABLED`, known up front from `me`), so the card points them to Security.
 */
export function EnableOwnTwoFactorCallout({ answered }: EnableOwnTwoFactorCalloutProps) {
  const { orgId, projectId } = useProjectParams();

  return (
    <Callout
      tone="warning"
      {...(answered ? { role: "alert" as const } : {})}
      title="Turn on two-factor authentication for your own account first"
      action={
        <RowAction asChild>
          <Link to="/$orgId/$projectId/settings/security" params={{ orgId, projectId }}>
            Open Settings › Security
          </Link>
        </RowAction>
      }
    >
      You can't require it for others until your own account uses it.
    </Callout>
  );
}
