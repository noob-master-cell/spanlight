import { useEffect, useState } from "react";

import { AuthBackLink } from "./auth-footer";
import { AuthLayout } from "./auth-layout";
import { clearFragment, readFragmentParam } from "./fragment-token";
import { ResetLinkInvalid } from "./reset-link-invalid";
import { ResetPasswordForm } from "./reset-password-form";

/**
 * Where the emailed link lands: `/reset-password#token=…`. The token is read from the fragment once,
 * kept in component state, and taken out of the address bar. Signed-in people may open it too.
 */
export function ResetPasswordPage() {
  const [token] = useState(() => readFragmentParam("token"));
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    clearFragment();
  }, []);

  if (token === null || rejected) {
    return <ResetLinkInvalid />;
  }

  return (
    <AuthLayout title="Choose a new" accent="password">
      <ResetPasswordForm
        token={token}
        onInvalidLink={() => {
          setRejected(true);
        }}
      />
      <AuthBackLink />
    </AuthLayout>
  );
}
