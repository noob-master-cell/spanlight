import { Button } from "@/components/ui/button";

import { RecoveryCodesActions } from "./recovery-codes-step";

const FOOTER = "flex flex-wrap items-center gap-3";

/** Step 1: Cancel, Continue. Continue submits the dialog's form. */
export function ScanFooter({ onCancel }: { onCancel: () => void }) {
  return (
    <div className={`${FOOTER} justify-end`}>
      <Button onClick={onCancel}>Cancel</Button>
      <Button type="submit" variant="primary">
        Continue
      </Button>
    </div>
  );
}

interface ConfirmFooterProps {
  pending: boolean;
  canConfirm: boolean;
  onBack: () => void;
  onCancel: () => void;
}

/** Step 2: Back on the left, Cancel and Confirm on the right. */
export function ConfirmFooter({ pending, canConfirm, onBack, onCancel }: ConfirmFooterProps) {
  return (
    <div className={`${FOOTER} justify-between`}>
      <Button variant="ghost" onClick={onBack} disabled={pending}>
        Back
      </Button>
      <div className="flex items-center gap-2.5">
        <Button onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending} disabled={!canConfirm}>
          Confirm
        </Button>
      </div>
    </div>
  );
}

interface CodesFooterProps {
  codes: readonly string[];
  onDone: () => void;
}

/** Step 3: Copy and Download on the left, the acknowledgement on the right. */
export function CodesFooter({ codes, onDone }: CodesFooterProps) {
  return (
    <div className={`${FOOTER} justify-between`}>
      <RecoveryCodesActions codes={codes} />
      <Button variant="primary" onClick={onDone}>
        I've saved them
      </Button>
    </div>
  );
}
