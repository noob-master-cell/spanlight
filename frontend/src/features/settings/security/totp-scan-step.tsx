import { QRCodeSVG } from "qrcode.react";

import { CopyButton } from "@/components/copy-button";
import { useMe } from "@/features/auth";
import type { TotpSetup } from "@/lib/api";

import { groupSecret } from "./totp-flow";

interface TotpScanStepProps {
  setup: TotpSetup;
}

/**
 * Step 1: the QR code for an authenticator app and, for someone who can't scan it, the key to type.
 * The secret is only drawn here: it is not copied to storage or logged.
 */
export function TotpScanStep({ setup }: TotpScanStepProps) {
  const { user } = useMe();

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      {/* Always dark on white, in either theme: a scanner needs that contrast and a quiet zone. */}
      <div
        role="img"
        aria-label="QR code for the authenticator app. If you can't scan it, use the key beside it."
        className="flex size-[188px] shrink-0 items-center justify-center self-center rounded-tile border border-border bg-rail-foreground sm:self-start"
      >
        <QRCodeSVG
          value={setup.otpauth_url}
          size={156}
          level="M"
          marginSize={0}
          fgColor="var(--rail)"
          bgColor="var(--rail-foreground)"
          aria-hidden
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Use any authenticator app, such as 1Password, Authy or Google Authenticator. It will show
          a new 6-digit code every 30 seconds.
        </p>
        <p className="text-sm font-semibold text-foreground">Can't scan it? Enter this key:</p>
        <div className="flex items-center gap-2.5 rounded-input border border-border bg-surface-muted py-2.5 pr-2 pl-3.5">
          <p className="min-w-0 flex-1 font-mono text-sm leading-[1.7] break-all text-foreground">
            {groupSecret(setup.secret)}
          </p>
          <CopyButton
            value={setup.secret}
            label="Copy setup key"
            variant="secondary"
            className="size-[30px] shadow-none"
          />
        </div>
        <p className="text-xs font-medium text-subtle-foreground">
          Account {user.email} · Issuer Spanlight · Time-based
        </p>
      </div>
    </div>
  );
}
