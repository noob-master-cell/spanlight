import { useQueryClient } from "@tanstack/react-query";
import { useState, type SyntheticEvent } from "react";
import { toast } from "sonner";

import { Callout } from "@/components/callout";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMe } from "@/features/auth";
import { queryKeys, securityApi } from "@/lib/api";
import { useUncachedAction } from "@/lib/use-uncached-action";

import { DialogHeading } from "../dialog-heading";
import {
  NOT_AVAILABLE_TITLE,
  RATE_LIMITED_MESSAGE,
  WRONG_CODE_MESSAGE,
  WRONG_RECOVERY_CODE_MESSAGE,
  classifyTotpError,
  isAuthenticatorCode,
  orgsRequiringTwoFactor,
  requiredByOrgsWarning,
} from "./totp-flow";

interface TotpDisableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Turning two-factor authentication off takes a code from the app or a recovery code, which is
 * spent. When an organization the person belongs to requires it, the dialog says what turning it
 * off costs (Figma "Turn off 2FA dialog", with and without the warning).
 */
export function TotpDisableDialog({ open, onOpenChange }: TotpDisableDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open, so closing it drops whatever was typed. */}
      {open ? <TotpDisableBody onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

/** What went wrong, and so where to say it: under the field, in a callout, or as a lockout. */
type Problem =
  | { kind: "field"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "rate-limited" };

function TotpDisableBody({ onClose }: { onClose: () => void }) {
  const { memberships } = useMe();
  const queryClient = useQueryClient();
  const disable = useUncachedAction(securityApi.totpDisable);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const warning = requiredByOrgsWarning(orgsRequiringTwoFactor(memberships));
  const rateLimited = problem?.kind === "rate-limited";

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const value = code.trim();
    if (value === "" || disable.pending || rateLimited) {
      return;
    }
    setProblem(null);
    const result = await disable.run(value);
    if (result.ok) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.totp });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast.success("Two-factor authentication is off.");
      onClose();
      return;
    }

    const failure = classifyTotpError(result.error);
    switch (failure.kind) {
      case "invalid-code":
        setProblem({
          kind: "field",
          message: isAuthenticatorCode(value) ? WRONG_CODE_MESSAGE : WRONG_RECOVERY_CODE_MESSAGE,
        });
        return;
      case "rate-limited":
        setProblem({ kind: "rate-limited" });
        return;
      case "not-enabled":
        // Turned off in another tab since this page loaded.
        void queryClient.invalidateQueries({ queryKey: queryKeys.totp });
        void queryClient.invalidateQueries({ queryKey: queryKeys.me });
        onClose();
        return;
      case "not-configured":
        setProblem({ kind: "unavailable", message: failure.message });
        return;
      default:
        setProblem({
          kind: "field",
          message: failure.kind === "other" ? failure.message : "That didn't work. Try again.",
        });
    }
  }

  const fieldError = problem?.kind === "field" ? problem.message : undefined;

  return (
    <DialogContent
      hideClose
      className="max-w-[560px] gap-0 rounded-card p-5 sm:p-7"
      // Closing mid-request would drop the answer; Cancel is disabled for the same reason.
      onEscapeKeyDown={(event) => {
        if (disable.pending) {
          event.preventDefault();
        }
      }}
      onInteractOutside={(event) => {
        if (disable.pending) {
          event.preventDefault();
        }
      }}
    >
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        noValidate
        className="flex flex-col gap-5"
      >
        <DialogHeading
          showClose={disable.pending ? "disabled" : true}
          title="Turn off two-factor authentication?"
          description="You'll sign in with only your password or a connected provider. Your remaining recovery codes stop working."
        />
        {warning ? <Callout tone="warning">{warning}</Callout> : null}
        {problem?.kind === "unavailable" ? (
          <Callout tone="warning" title={NOT_AVAILABLE_TITLE} role="alert">
            {problem.message}
          </Callout>
        ) : null}
        <FormField
          label="Authentication code"
          hint="Enter a code from your authenticator app, or one of your recovery codes."
          error={rateLimited ? RATE_LIMITED_MESSAGE : fieldError}
        >
          <Input
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setProblem((current) => (current?.kind === "rate-limited" ? current : null));
            }}
            placeholder="6-digit code or recovery code"
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </FormField>
        <DialogFooter className="gap-2.5">
          <Button onClick={onClose} disabled={disable.pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={disable.pending}
            disabled={code.trim() === "" || rateLimited}
          >
            Turn off
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
