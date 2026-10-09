import { Link } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";

import { Callout } from "@/components/callout";
import { Button } from "@/components/ui/button";

import { AuthLayout } from "./auth-layout";
import { AuthStatusTile } from "./auth-status-tile";
import { EXPIRED_MESSAGE } from "./two-factor-flow";

interface TwoFactorExpiredProps {
  next: string | undefined;
}

/** The challenge is gone (a reload, five minutes, a password change): only signing in again helps. */
export function TwoFactorExpired({ next }: TwoFactorExpiredProps) {
  return (
    <AuthLayout
      title="One more"
      accent="step."
      status={<AuthStatusTile icon={CircleAlert} tone="danger" />}
    >
      <Callout tone="danger" role="alert">
        {EXPIRED_MESSAGE}
      </Callout>
      <Button asChild variant="primary" size="lg">
        <Link to="/login" search={{ next }}>
          Back to sign in
        </Link>
      </Button>
    </AuthLayout>
  );
}
