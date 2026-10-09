import { X } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface DialogHeadingProps {
  /** A small uppercase line above the title, e.g. "TWO-FACTOR AUTHENTICATION · STEP 1 OF 3". */
  overline?: string;
  title: string;
  description?: ReactNode;
  /**
   * The round muted close button. `false` leaves it out where the dialog must be answered, not
   * dismissed; `"disabled"` keeps it but inert, while a request is running.
   */
  showClose?: boolean | "disabled";
  /** So a step change can move focus to the new title. */
  titleRef?: Ref<HTMLHeadingElement>;
}

/**
 * Figma "Settings/Dialog header", shared by the app's dialogs: overline, 22 px title, muted
 * description and a close button.
 */
export function DialogHeading({
  overline,
  title,
  description,
  showClose = true,
  titleRef,
}: DialogHeadingProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {overline ? (
          <p className="text-overline text-subtle-foreground uppercase">{overline}</p>
        ) : null}
        <DialogTitle ref={titleRef} tabIndex={-1} className="[overflow-wrap:anywhere] outline-none">
          {title}
        </DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </div>
      {showClose ? (
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            disabled={showClose === "disabled"}
            className="bg-surface-muted"
          >
            <X aria-hidden />
          </Button>
        </DialogClose>
      ) : null}
    </div>
  );
}
