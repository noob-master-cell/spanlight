import { Mail, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { useMe } from "./queries";
import { ResendNote } from "./resend-note";
import { useResendVerification } from "./use-resend-verification";
import { dismissBanner, isBannerDismissed } from "./verify-banner-dismissal";

/**
 * The soft prompt at the top of the app to verify the email address (Figma "Overview/Verify
 * banner"). It shows only when the server can send email and this address is still unverified,
 * never blocks anything, and can be dismissed for the session.
 */
export function VerifyEmailBanner() {
  const { user, email_verification_required: required } = useMe();
  const [dismissed, setDismissed] = useState(() => isBannerDismissed(user.id));
  const resend = useResendVerification();
  const noteRef = useRef<HTMLParagraphElement>(null);
  const sent = resend.state.kind === "sent" || resend.state.kind === "already-verified";

  // "Resend link" is replaced by "Sent." while it has keyboard focus: put focus on the note, so it
  // does not fall back to the top of the page.
  useEffect(() => {
    if (sent) {
      noteRef.current?.focus();
    }
  }, [sent]);

  if (!required || dismissed) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-tile bg-accent-subtle py-3 pr-2 pl-3 sm:mb-8 sm:flex-nowrap sm:items-center sm:gap-x-3.5 sm:py-2.5 sm:pr-2.5">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-accent"
      >
        <Mail className="size-[18px]" strokeWidth={2} />
      </span>
      <p className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere] text-foreground">
        Check <span className="font-bold">{user.email}</span> for a verification link. Verifying
        lets you turn on two-factor authentication.
      </p>
      <div className="order-3 flex basis-full items-center gap-3 pl-12 sm:order-1 sm:basis-auto sm:pl-0">
        <ResendNote ref={noteRef} state={resend.state} className="h-10 pr-3.5 sm:px-3.5" />
        {sent ? null : (
          <Button loading={resend.pending} onClick={resend.resend}>
            Resend link
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss"
        className="relative order-2 after:absolute after:-inset-1.5"
        onClick={() => {
          dismissBanner(user.id);
          setDismissed(true);
        }}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}
