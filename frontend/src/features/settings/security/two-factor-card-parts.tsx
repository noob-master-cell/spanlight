import { KeyRound } from "lucide-react";
import { useEffect, useRef } from "react";

import { Callout } from "@/components/callout";
import { RowAction } from "@/components/tile-list";
import { ResendNote, useResendVerification } from "@/features/auth";

import { RECOVERY_CODE_TOTAL } from "./recovery-codes";
import { NOT_AVAILABLE_TITLE, recoveryCodesSummary } from "./totp-flow";

/** Ten segments, one per recovery code: violet while unused, grey once spent (decorative). */
function Meter({ remaining }: { remaining: number }) {
  return (
    <div aria-hidden className="flex shrink-0 items-center gap-1">
      {Array.from({ length: RECOVERY_CODE_TOTAL }, (_, index) => (
        <span
          key={index}
          className={`h-5 w-1.5 rounded-full ${index < remaining ? "bg-accent" : "bg-border-strong"}`}
        />
      ))}
    </div>
  );
}

/** The "Recovery codes" tile in the card's on state: how many are left, as words and a meter. */
export function RecoveryCodesTile({ remaining }: { remaining: number }) {
  return (
    <div className="flex items-center gap-3.5 rounded-tile bg-surface-muted px-4 py-3.5">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-input border border-border bg-surface"
      >
        <KeyRound className="size-[18px] text-foreground" strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className="text-sm font-semibold text-foreground">Recovery codes</p>
        <p className="text-xs font-medium text-muted-foreground">
          {recoveryCodesSummary(remaining)}
        </p>
      </div>
      <Meter remaining={remaining} />
    </div>
  );
}

/**
 * Why "Turn on" is disabled: the email address is not verified yet (only when the server sends
 * email at all). Offers to send the link again.
 */
export function VerifyEmailCallout({ email }: { email: string }) {
  const resend = useResendVerification();
  const sent = resend.state.kind === "sent" || resend.state.kind === "already-verified";
  const noteRef = useRef<HTMLParagraphElement>(null);

  // "Resend link" is replaced by the note while it has keyboard focus: put focus on the note, as
  // the banner does, so it does not fall back to the top of the page.
  useEffect(() => {
    if (sent) {
      noteRef.current?.focus();
    }
  }, [sent]);

  return (
    <Callout
      tone="warning"
      title="Verify your email first"
      action={
        <div className="flex items-center gap-3">
          {sent ? null : (
            <RowAction loading={resend.pending} onClick={resend.resend}>
              Resend link
            </RowAction>
          )}
          <ResendNote ref={noteRef} state={resend.state} />
        </div>
      }
    >
      Check {email} for a verification link. Verifying lets you turn on two-factor authentication.
    </Callout>
  );
}

/** The answer to "Turn on" when the server has no key to encrypt authenticator secrets. */
export function NotAvailableCallout() {
  return (
    <Callout tone="warning" title={NOT_AVAILABLE_TITLE} role="alert">
      An administrator needs to set CREDENTIALS_KEYS, the key Spanlight uses to encrypt
      authenticator secrets. Until then, two-factor authentication can't be turned on.
    </Callout>
  );
}
