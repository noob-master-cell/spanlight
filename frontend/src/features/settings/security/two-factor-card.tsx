import { ShieldCheck, ShieldOff } from "lucide-react";
import { useId } from "react";

import { Callout } from "@/components/callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { DisabledReason } from "../disabled-reason";
import {
  NotAvailableCallout,
  RecoveryCodesTile,
  VerifyEmailCallout,
} from "./two-factor-card-parts";
import { lowRecoveryCodesWarning } from "./totp-flow";

/** What the card shows: the three situations the account can be in. */
export type TwoFactorCardState =
  | {
      kind: "off";
      /** The setup request is in flight. */
      starting: boolean;
      /** "Turn on" was answered with `409 NOT_CONFIGURED`. */
      notAvailable: boolean;
    }
  | { kind: "email-unverified"; email: string }
  | { kind: "on"; since: string | null; recoveryCodesRemaining: number };

interface TwoFactorCardProps {
  state: TwoFactorCardState;
  onTurnOn: () => void;
  onTurnOff: () => void;
}

const OFF_TEXT =
  "Protect your account with a 6-digit code from an authenticator app each time you sign in.";

function onText(since: string | null): string {
  const date = formatDate(since);
  const lead = date ? `On since ${date}. ` : "";
  return `${lead}You'll enter a code from your authenticator app each time you sign in.`;
}

/**
 * The two-factor card (Figma "Settings/Two-factor card"): off, off but the email is unverified, off
 * after the server said it can't, and on with its recovery codes.
 */
export function TwoFactorCard({ state, onTurnOn, onTurnOff }: TwoFactorCardProps) {
  const titleId = useId();
  const on = state.kind === "on";
  const blocked = state.kind === "email-unverified" || (state.kind === "off" && state.notAvailable);
  const Icon = blocked ? ShieldOff : ShieldCheck;
  const low = state.kind === "on" ? lowRecoveryCodesWarning(state.recoveryCodesRemaining) : null;

  return (
    <Card role="region" aria-labelledby={titleId} className="flex flex-col gap-[18px] p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span
          aria-hidden
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-input",
            blocked && "bg-surface-muted text-muted-foreground",
            on && "bg-success-subtle text-success",
            !blocked && !on && "bg-accent-subtle text-accent",
          )}
        >
          <Icon className="size-[22px]" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h2 id={titleId} className="text-card">
              Two-factor authentication
            </h2>
            <Badge variant={on ? "success" : "neutral"}>{on ? "On" : "Off"}</Badge>
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            {state.kind === "on" ? onText(state.since) : OFF_TEXT}
          </p>
        </div>
        {state.kind === "on" ? (
          <Button onClick={onTurnOff}>Turn off</Button>
        ) : state.kind === "email-unverified" ? (
          <DisabledReason reason="Verify your email address first.">
            <Button variant="primary" disabled>
              Turn on
            </Button>
          </DisabledReason>
        ) : (
          <Button variant="primary" loading={state.starting} onClick={onTurnOn}>
            Turn on
          </Button>
        )}
      </div>

      {state.kind === "on" ? <RecoveryCodesTile remaining={state.recoveryCodesRemaining} /> : null}
      {low ? <Callout tone="warning">{low}</Callout> : null}
      {state.kind === "email-unverified" ? <VerifyEmailCallout email={state.email} /> : null}
      {state.kind === "off" && state.notAvailable ? <NotAvailableCallout /> : null}
    </Card>
  );
}
