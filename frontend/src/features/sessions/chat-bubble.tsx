import { CircleAlert } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/** Messages longer than this are clipped until the reader asks for the rest. */
const BUBBLE_TEXT_LIMIT = 2000;

interface MessageBubbleProps {
  role: "user" | "assistant";
  text: string;
}

/**
 * One side of a turn (Figma "Session/Chat bubble"): the user's message in an ink bubble on
 * the right, the assistant's reply in a muted bubble on the left.
 */
export function MessageBubble({ role, text }: MessageBubbleProps) {
  const [showAll, setShowAll] = useState(false);
  const isUser = role === "user";
  const isLong = text.length > BUBBLE_TEXT_LIMIT;
  const shown = isLong && !showAll ? `${text.slice(0, BUBBLE_TEXT_LIMIT).trimEnd()}…` : text;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex min-w-0 flex-col items-start gap-1 rounded-tile px-4 py-3 text-sm leading-normal",
          isUser
            ? "max-w-[min(85%,520px)] rounded-tr-xs bg-ink text-ink-foreground"
            : "max-w-[min(92%,600px)] rounded-tl-xs border border-border bg-surface-muted text-foreground",
        )}
      >
        <span className="sr-only">{isUser ? "User:" : "Assistant:"}</span>
        <p className="break-words whitespace-pre-wrap">{shown}</p>
        {isLong ? (
          <button
            type="button"
            aria-expanded={showAll}
            className={cn(
              "rounded-xs text-xs font-semibold underline underline-offset-4",
              isUser ? "text-ink-foreground" : "text-accent",
            )}
            onClick={() => {
              setShowAll((current) => !current);
            }}
          >
            {showAll ? "Show less" : "Show full message"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

interface FailedBubbleProps {
  title: string;
  message: string | null;
}

/** A failed turn in place of the reply: rose outline, what failed and the error message. */
export function FailedBubble({ title, message }: FailedBubbleProps) {
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[min(92%,600px)] min-w-0 flex-col gap-1.5 rounded-tile rounded-tl-xs border-[1.5px] border-danger bg-surface px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-danger-text">
          <CircleAlert aria-hidden className="size-4 shrink-0 text-danger" />
          <span className="min-w-0 break-words">{title}</span>
        </p>
        <p className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
          {message ?? "No error message was recorded for this turn."}
        </p>
      </div>
    </div>
  );
}
