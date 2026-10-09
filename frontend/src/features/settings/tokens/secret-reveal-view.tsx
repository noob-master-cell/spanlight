import { CopyButton } from "@/components/copy-button";
import { Callout } from "@/components/callout";
import { DialogHeading } from "@/components/dialog-heading";
import { SecretBox } from "@/components/secret-box";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { REVEAL_COPY } from "@/lib/reveal-copy";

import { expiryDescription } from "./expiry";
import { ScopeTag } from "./scope-tag";

interface SecretRevealViewProps {
  kind: "key" | "token";
  name: string;
  /** The whole secret. It is shown here, once, and the caller keeps it in component state only. */
  secret: string;
  scopes: readonly string[];
  expiresAt: string | null;
}

/**
 * The second step of the create dialogs (Figma "Key created" and "Token created"): the secret in
 * an ink box with a Copy button, what it can do and when it ends, and the line to put it to use.
 */
export function SecretRevealView({ kind, name, secret, scopes, expiresAt }: SecretRevealViewProps) {
  const copy = REVEAL_COPY[kind];
  const usage = copy.usageLine(secret);

  return (
    <div className="grid gap-[18px]">
      <DialogHeading
        title={copy.title}
        description={
          <>
            <span className="font-semibold text-foreground">{name}</span> is ready to use.
          </>
        }
      />

      <Callout tone="warning">{copy.warning}</Callout>

      <SecretBox label={copy.secretLabel} secret={secret} copyAriaLabel={copy.copyAriaLabel} />

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
        {scopes.length === 1 ? "Scope" : "Scopes"}
        {scopes.map((scope) => (
          <ScopeTag key={scope} scope={scope} />
        ))}
        <span aria-hidden className="text-subtle-foreground">
          ·
        </span>
        {expiryDescription(expiresAt)}
      </p>

      <div className="grid gap-2">
        <p className="text-xs font-medium text-muted-foreground">{copy.usageHint}</p>
        <div className="flex items-center gap-2.5 rounded-input border border-border bg-surface-muted py-2.5 pr-2 pl-3.5">
          <code className="min-w-0 flex-1 font-mono text-label break-all text-foreground">
            {usage}
          </code>
          <CopyButton
            value={usage}
            label={copy.usageCopyLabel}
            variant="secondary"
            className="size-[30px] shadow-none [&_svg]:size-3.5"
          />
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="primary">Done</Button>
        </DialogClose>
      </DialogFooter>
    </div>
  );
}
