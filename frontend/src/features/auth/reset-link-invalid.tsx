import { Link } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";

import { Callout } from "@/components/callout";
import { Button } from "@/components/ui/button";

import { AuthBackLink } from "./auth-footer";
import { AuthLayout } from "./auth-layout";
import { AuthStatusTile } from "./auth-status-tile";

/** A reset link with no token, or one the server turned down: unknown, used or expired. */
export function ResetLinkInvalid() {
  return (
    <AuthLayout
      title="Choose a new"
      accent="password"
      status={<AuthStatusTile icon={CircleAlert} tone="danger" />}
    >
      <Callout tone="danger" role="alert">
        This link is invalid or has expired. Request a new one.
      </Callout>
      <Button asChild variant="primary" size="lg">
        <Link to="/forgot-password">Request a new link</Link>
      </Button>
      <AuthBackLink />
    </AuthLayout>
  );
}
