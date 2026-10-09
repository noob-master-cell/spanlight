import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Callout } from "@/components/callout";
import { recallOAuthProvider } from "@/features/auth";

import { linkErrorCopy } from "./link-error-copy";
import { securitySearchSchema } from "./search";

/**
 * The callout above "Sign-in methods" after connecting a provider failed. It is announced and takes
 * focus once, then the code leaves the address bar, so a reload does not show it again.
 */
export function OAuthLinkError() {
  const search = useLocation({ select: (location) => location.search });
  const navigate = useNavigate();
  const [copy] = useState(() =>
    linkErrorCopy(securitySearchSchema.parse(search).error, recallOAuthProvider()),
  );
  const calloutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (copy === null) {
      return;
    }
    calloutRef.current?.focus();
    // Drop `error` only: the project's time range and environment ride along in the same search.
    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, error: undefined }),
      replace: true,
    });
  }, [copy, navigate]);

  if (copy === null) {
    return null;
  }
  return (
    <div ref={calloutRef} role="alert" tabIndex={-1} className="rounded-input outline-none">
      <Callout tone="danger" title={copy.title}>
        {copy.message}
      </Callout>
    </div>
  );
}
