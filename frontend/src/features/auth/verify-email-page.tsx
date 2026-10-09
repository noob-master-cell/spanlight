import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { authApi, errorMessage, queryKeys } from "@/lib/api";

import { clearFragment, readFragmentParam } from "./fragment-token";
import { meQueryOptions } from "./queries";
import { isDeadLinkError } from "./verify-email-flow";
import {
  VerifyEmailChecking,
  VerifyEmailFailure,
  VerifyEmailRetry,
  VerifyEmailSuccess,
} from "./verify-email-result";

/**
 * Where the emailed link lands: `/verify-email#token=…`. It needs no session, because the link is
 * often opened in a browser that is not signed in. The token is read from the fragment once, sent to
 * the confirm route and taken out of the address bar.
 */
export function VerifyEmailPage() {
  const queryClient = useQueryClient();
  const [token] = useState(() => readFragmentParam("token"));
  const started = useRef(false);
  const me = useQuery(meQueryOptions);

  const confirm = useMutation({
    // The token is a credential: it stays in this page's memory and is sent from here, so it is not
    // the mutation's variables, and nothing is kept in the mutation cache after use.
    gcTime: 0,
    mutationFn: () => {
      if (token === null) {
        throw new Error("No token to confirm");
      }
      return authApi.confirmEmailVerification(token);
    },
    // The banner asks for verification until the session says it is done.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
  const { mutate } = confirm;

  useEffect(() => {
    clearFragment();
    // A token is single use: never send it twice, as development's double effect would.
    if (token === null || started.current) {
      return;
    }
    started.current = true;
    mutate();
  }, [token, mutate]);

  const signedIn = Boolean(me.data);
  if (token === null || (confirm.isError && isDeadLinkError(confirm.error))) {
    return <VerifyEmailFailure signedIn={signedIn} />;
  }
  if (confirm.isError) {
    // Not the link's fault (offline, a server error): the fragment is gone, but the token is not.
    return (
      <VerifyEmailRetry
        message={errorMessage(confirm.error)}
        signedIn={signedIn}
        onRetry={() => {
          mutate();
        }}
      />
    );
  }
  if (confirm.isSuccess) {
    return <VerifyEmailSuccess signedIn={signedIn} />;
  }
  return <VerifyEmailChecking />;
}
