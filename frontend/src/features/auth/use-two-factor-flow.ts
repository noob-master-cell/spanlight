import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type RefObject } from "react";

import { securityApi } from "@/lib/api";

import { clearFragment } from "./fragment-token";
import { releaseChallenge, resolveChallenge } from "./login-challenge";
import { postLoginDestination } from "./login-flow";
import { refreshMe } from "./queries";
import {
  canSubmitCode,
  classifyTwoFactorError,
  type CodeMode,
  type TwoFactorFailure,
} from "./two-factor-flow";

type FormFailure = Exclude<TwoFactorFailure, { kind: "expired" }>;

export interface TwoFactorFlow {
  mode: CodeMode;
  code: string;
  setCode: (value: string) => void;
  /** Why the last try failed, when the form is still the right place to say so. */
  failure: FormFailure | null;
  /** The challenge is gone or ran out: only signing in again helps. */
  expired: boolean;
  pending: boolean;
  canSubmit: boolean;
  submit: () => void;
  switchMode: () => void;
}

/**
 * The second step of signing in: the challenge from the password step (held in memory) or from the
 * OAuth redirect (in the URL fragment), the code the person types, and the answer to `verify`.
 */
export function useTwoFactorFlow(
  next: string | undefined,
  inputRef: RefObject<HTMLInputElement | null>,
): TwoFactorFlow {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [challenge] = useState(() => resolveChallenge());
  // Only the server says a challenge ran out (`401 TOTP_CHALLENGE_INVALID`): a clock that runs fast
  // must not lock someone out. Without any challenge there is nothing to send.
  const [expired, setExpired] = useState(() => challenge === null);
  const [mode, setMode] = useState<CodeMode>("code");
  const [code, setCodeState] = useState("");
  const [failure, setFailure] = useState<FormFailure | null>(null);

  const rateLimited = failure?.kind === "rate-limited";

  // The challenge is in state now: take it out of the address bar and out of the shared memory, so
  // leaving this page for good cannot leave a sign-in that something else could resume.
  useEffect(() => {
    clearFragment();
    releaseChallenge();
    return releaseChallenge;
  }, []);

  // Land in the field, and again after switching between the app's code and a recovery code.
  useEffect(() => {
    inputRef.current?.focus();
  }, [mode, expired, inputRef]);

  // After a refusal, select what was typed so the next try replaces it.
  useEffect(() => {
    if (failure && failure.kind !== "rate-limited") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [failure, inputRef]);

  const verify = useMutation({
    // The code and the challenge are credentials: don't keep them in the mutation cache after use.
    gcTime: 0,
    mutationFn: (value: string) => {
      if (challenge === null) {
        throw new Error("No challenge to verify");
      }
      return securityApi.totpVerify({ challenge: challenge.token, code: value });
    },
    onSuccess: async () => {
      await refreshMe(queryClient);
      await navigate({ href: postLoginDestination(next) });
    },
    onError: (error) => {
      const classified = classifyTwoFactorError(error);
      if (classified.kind === "expired") {
        setExpired(true);
        return;
      }
      setFailure(classified);
    },
  });

  return {
    mode,
    code,
    // Editing clears "that didn't work", but not a rate limit: more tries won't lift it.
    setCode: (value) => {
      setCodeState(value);
      setFailure((current) => (current?.kind === "rate-limited" ? current : null));
    },
    failure,
    expired,
    pending: verify.isPending,
    canSubmit: canSubmitCode(mode, code) && !rateLimited,
    submit: () => {
      if (challenge === null || !canSubmitCode(mode, code) || rateLimited) {
        return;
      }
      setFailure(null);
      verify.mutate(code.trim());
    },
    switchMode: () => {
      setMode((current) => (current === "code" ? "recovery" : "code"));
      setCodeState("");
      setFailure((current) => (current?.kind === "rate-limited" ? current : null));
    },
  };
}
