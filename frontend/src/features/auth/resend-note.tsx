import { CircleAlert, CircleCheck } from "lucide-react";
import type { Ref } from "react";

import { cn } from "@/lib/utils";

import type { ResendState } from "./use-resend-verification";

interface ResendNoteProps {
  state: ResendState;
  className?: string;
  /** For a caller that moves focus here when the button it replaces goes away. */
  ref?: Ref<HTMLParagraphElement>;
}

function noteText(state: ResendState): string | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "sent":
      return "Sent. Check your inbox.";
    case "already-verified":
      return "Your email is already verified.";
    case "error":
      return state.message;
  }
}

/**
 * What "Resend link" turns into once it has an answer: a polite status line, in green when a link is
 * on its way and in red when it was refused. The status element is always there, empty until then,
 * so screen readers announce the text when it arrives.
 */
export function ResendNote({ state, className, ref }: ResendNoteProps) {
  const text = noteText(state);
  const failed = state.kind === "error";
  const Icon = failed ? CircleAlert : CircleCheck;

  return (
    <p
      ref={ref}
      role="status"
      // Focusable by script only, so focus has somewhere stable to land.
      tabIndex={-1}
      className={cn(
        "outline-none",
        text === null
          ? "sr-only"
          : cn(
              "flex items-center gap-1.5 text-sm font-semibold",
              failed ? "text-danger-text" : "text-success",
              className,
            ),
      )}
    >
      {text === null ? null : (
        <>
          <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2} />
          {text}
        </>
      )}
    </p>
  );
}
