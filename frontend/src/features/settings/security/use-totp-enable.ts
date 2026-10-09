import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { queryKeys, securityApi } from "@/lib/api";
import { useUncachedAction } from "@/lib/use-uncached-action";

import { classifyTotpError } from "./totp-flow";

export type EnableFailure = { kind: "invalid-code" } | { kind: "other"; message: string };

interface UseTotpEnableOptions {
  /** The server can't do two-factor authentication (`409 NOT_CONFIGURED`): the card says so. */
  onNotAvailable: () => void;
  /** The wizard has nothing more to do here: close it. */
  onClose: () => void;
}

/**
 * Confirms the first code and turns two-factor authentication on. The recovery codes in the answer
 * are held in this hook's state only (never the query cache, storage or a log) and are gone when
 * the dialog that owns the hook closes.
 */
export function useTotpEnable({ onNotAvailable, onClose }: UseTotpEnableOptions) {
  const queryClient = useQueryClient();
  const enable = useUncachedAction(securityApi.totpEnable);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [failure, setFailure] = useState<EnableFailure | null>(null);

  function refresh(key: readonly unknown[]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }

  async function confirm(code: string) {
    setFailure(null);
    const result = await enable.run(code);
    if (result.ok) {
      setCodes(result.value.recovery_codes);
      refresh(queryKeys.totp);
      refresh(queryKeys.me);
      return;
    }

    const classified = classifyTotpError(result.error);
    switch (classified.kind) {
      case "invalid-code":
        setFailure({ kind: "invalid-code" });
        return;
      case "not-configured":
        onNotAvailable();
        onClose();
        return;
      case "email-unverified":
        // Another tab or a server change since the page loaded: the card shows the same state.
        refresh(queryKeys.me);
        toast.error("Verify your email address before turning on two-factor authentication.");
        onClose();
        return;
      case "already-enabled":
        refresh(queryKeys.totp);
        refresh(queryKeys.me);
        toast.info("Two-factor authentication is already on.");
        onClose();
        return;
      default:
        setFailure({
          kind: "other",
          message:
            classified.kind === "other" ? classified.message : "That didn't work. Try again.",
        });
    }
  }

  return {
    codes,
    failure,
    pending: enable.pending,
    confirm,
    clearFailure: () => {
      setFailure(null);
    },
  };
}
