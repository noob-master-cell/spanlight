import { Download } from "lucide-react";

import { Callout } from "@/components/callout";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth";
import { formatDate } from "@/lib/format";

import {
  RECOVERY_CODES_FILENAME,
  numberedColumns,
  recoveryCodesClipboardText,
  recoveryCodesFileText,
} from "./recovery-codes";
import { saveTextFile } from "./save-text-file";

interface RecoveryCodesStepProps {
  codes: readonly string[];
}

/** Step 3: confirmation that two-factor authentication is on, and the codes, shown this once. */
export function RecoveryCodesStep({ codes }: RecoveryCodesStepProps) {
  const [left, right] = numberedColumns(codes);
  const rows = Math.max(left.length, right.length);

  return (
    <div className="flex flex-col gap-5">
      <Callout tone="success">
        Two-factor authentication is on. If you lose your authenticator app, a recovery code gets
        you back in.
      </Callout>
      <ol
        aria-label="Recovery codes"
        className="grid grid-flow-col gap-x-6 gap-y-2.5 rounded-tile border border-border bg-surface-muted px-5 py-4 font-mono sm:px-[22px] sm:py-[18px]"
        style={{ gridTemplateRows: `repeat(${String(rows)}, auto)` }}
      >
        {[...left, ...right].map(({ position, code }) => (
          <li key={position} className="flex items-center gap-3.5">
            <span aria-hidden className="text-label text-subtle-foreground">
              {position}
            </span>
            <code className="text-sm leading-[1.7] text-foreground select-all">{code}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Copy and Download: the two ways to keep the codes. Neither stores or sends them anywhere. */
export function RecoveryCodesActions({ codes }: RecoveryCodesStepProps) {
  const { user } = useMe();

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <CopyButton
        value={recoveryCodesClipboardText(codes)}
        label="Copy"
        showLabel
        variant="secondary"
        size="md"
      />
      <Button
        variant="secondary"
        onClick={() => {
          saveTextFile(
            RECOVERY_CODES_FILENAME,
            recoveryCodesFileText(codes, user.email, formatDate(new Date().toISOString())),
          );
        }}
      >
        <Download aria-hidden />
        Download
      </Button>
    </div>
  );
}
