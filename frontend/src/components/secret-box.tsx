import { useId } from "react";

import { CopyButton } from "@/components/copy-button";

interface SecretBoxProps {
  /** The visible label above the box, e.g. "Secret key". */
  label: string;
  /** The whole secret. The caller keeps it in component state only. */
  secret: string;
  /** What the Copy button says to screen readers, e.g. "Copy gateway key". */
  copyAriaLabel: string;
}

/**
 * A secret shown once, in the ink box with a lime Copy button that takes focus (Figma "Key
 * created" and "Token created").
 */
export function SecretBox({ label, secret, copyAriaLabel }: SecretBoxProps) {
  const labelId = useId();

  return (
    <div role="group" aria-labelledby={labelId} className="grid gap-2">
      <p id={labelId} className="text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center gap-3 rounded-tile bg-hero-card py-3.5 pr-3 pl-[18px] text-hero-card-foreground">
        <code className="min-w-0 flex-1 font-mono text-code break-all select-all">{secret}</code>
        <CopyButton
          value={secret}
          label="Copy"
          aria-label={copyAriaLabel}
          showLabel
          variant="highlight"
          autoFocus
          className="h-[34px] px-3.5 text-sm [&_svg]:size-3.5 [&_svg]:text-lime-foreground"
        />
      </div>
    </div>
  );
}
