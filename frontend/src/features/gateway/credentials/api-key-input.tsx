import { Eye, EyeOff } from "lucide-react";
import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ApiKeyInputProps extends Omit<ComponentProps<"input">, "type"> {
  /** Whether the typed key is readable. The caller owns it so it can hide the key on submit. */
  revealed: boolean;
  onRevealedChange: (revealed: boolean) => void;
}

/**
 * The API key field of the Figma add and rotate dialogs: a password input with an eye button.
 * The key is hidden by default and the field never receives a stored key, only what is typed.
 */
export function ApiKeyInput({ revealed, onRevealedChange, className, ...props }: ApiKeyInputProps) {
  const Icon = revealed ? EyeOff : Eye;
  return (
    <div className="relative">
      <Input
        type={revealed ? "text" : "password"}
        // Password managers ignore "off" on password inputs and offer to save the provider key.
        autoComplete="new-password"
        data-1p-ignore
        data-lpignore="true"
        autoCapitalize="off"
        spellCheck={false}
        className={cn("pr-12", className)}
        {...props}
      />
      <button
        type="button"
        aria-label={revealed ? "Hide key" : "Show key"}
        aria-pressed={revealed}
        onClick={() => {
          onRevealedChange(!revealed);
        }}
        className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <Icon aria-hidden className="size-4" />
      </button>
    </div>
  );
}
