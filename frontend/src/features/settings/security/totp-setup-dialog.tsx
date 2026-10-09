import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { toast } from "sonner";

import { DialogHeading } from "@/components/dialog-heading";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { TotpSetup } from "@/lib/api";
import { useNavigationLock } from "@/lib/navigation-lock";
import { cn } from "@/lib/utils";

import { RecoveryCodesStep } from "./recovery-codes-step";
import { TotpConfirmStep } from "./totp-confirm-step";
import { TotpScanStep } from "./totp-scan-step";
import { CodesFooter, ConfirmFooter, ScanFooter } from "./totp-setup-footers";
import { WRONG_CODE_MESSAGE } from "./totp-flow";
import { useTotpEnable } from "./use-totp-enable";

type Stage = "scan" | "confirm" | "codes";

const STAGES: readonly Stage[] = ["scan", "confirm", "codes"];

const HEADINGS: Record<Stage, { title: string; description?: string }> = {
  scan: { title: "Scan this QR code with an authenticator app" },
  confirm: {
    title: "Enter the 6-digit code to confirm",
    description: "Your authenticator app shows a new code every 30 seconds.",
  },
  codes: {
    title: "Save your recovery codes",
    description: "Each code works once. Store them somewhere safe; we won't show them again.",
  },
};

interface TotpSetupDialogProps {
  /** The secret from `POST /auth/totp/setup`. It lives in the card's state until this closes. */
  setup: TotpSetup;
  onClose: () => void;
  /** The server answered `409 NOT_CONFIGURED` while confirming. */
  onNotAvailable: () => void;
}

/**
 * The three-step wizard (Figma "Security — 2FA wizard"): scan, confirm a code, save the recovery
 * codes. The last step has to be answered: no close button, and Esc or a click outside does
 * nothing, because the codes are never shown again.
 */
export function TotpSetupDialog({ setup, onClose, onNotAvailable }: TotpSetupDialogProps) {
  const [step, setStep] = useState<"scan" | "confirm">("scan");
  const [code, setCode] = useState("");
  const enable = useTotpEnable({ onNotAvailable, onClose });
  const titleRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  const codes = enable.codes;
  // From the moment a code is sent until the person says they have saved the recovery codes, the
  // wizard can't be left: the answer holds codes that are never shown again, so closing now, by any
  // route, would turn two-factor on and lose them.
  const locked = codes !== null || enable.pending;
  useNavigationLock(locked);
  const stage: Stage = codes === null ? step : "codes";
  const index = STAGES.indexOf(stage);
  const heading = HEADINGS[stage];
  const invalid = enable.failure?.kind === "invalid-code";

  // Move focus along with the steps: into the code field, or onto the new title.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    (stage === "confirm" ? inputRef.current : titleRef.current)?.focus();
  }, [stage]);

  // After a refusal, select what was typed so the next try replaces it.
  useEffect(() => {
    if (enable.failure) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [enable.failure]);

  function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (stage === "scan") {
      setStep("confirm");
    } else if (stage === "confirm" && code.length === 6 && !enable.pending) {
      void enable.confirm(code);
    }
  }

  function finish() {
    toast.success("Two-factor authentication is on.");
    onClose();
  }

  const message =
    enable.failure?.kind === "invalid-code"
      ? WRONG_CODE_MESSAGE
      : enable.failure?.kind === "other"
        ? enable.failure.message
        : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked) {
          onClose();
        }
      }}
    >
      <DialogContent
        hideClose
        className="max-w-[600px] gap-0 rounded-card p-5 sm:p-7"
        // The first step has no description line: say so, rather than point at one that isn't there.
        {...(heading.description ? {} : { "aria-describedby": undefined })}
        onEscapeKeyDown={(event) => {
          if (locked) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (locked) {
            event.preventDefault();
          }
        }}
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div aria-hidden className="flex gap-1.5">
            {STAGES.map((name, position) => (
              <span
                key={name}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  position <= index ? "bg-accent" : "bg-border",
                )}
              />
            ))}
          </div>
          <DialogHeading
            overline={`Two-factor authentication · Step ${String(index + 1)} of 3`}
            title={heading.title}
            description={heading.description}
            showClose={!locked}
            titleRef={titleRef}
          />
          {stage === "scan" ? <TotpScanStep setup={setup} /> : null}
          {stage === "confirm" ? (
            <TotpConfirmStep
              code={code}
              onChange={(value) => {
                setCode(value);
                enable.clearFailure();
              }}
              message={message}
              invalid={invalid}
              inputRef={inputRef}
            />
          ) : null}
          {codes !== null ? <RecoveryCodesStep codes={codes} /> : null}

          {stage === "scan" ? <ScanFooter onCancel={onClose} /> : null}
          {stage === "confirm" ? (
            <ConfirmFooter
              pending={enable.pending}
              canConfirm={code.length === 6}
              onBack={() => {
                setStep("scan");
              }}
              onCancel={onClose}
            />
          ) : null}
          {codes !== null ? <CodesFooter codes={codes} onDone={finish} /> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
