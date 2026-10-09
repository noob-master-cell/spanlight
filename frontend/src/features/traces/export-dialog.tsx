import { X } from "lucide-react";
import { useState, type ReactElement } from "react";

import { Callout } from "@/components/callout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  exportWindowProblem,
  isExportNotConfigured,
  useExportSubmission,
} from "@/features/exports";
import { errorMessage, type ExportFormat } from "@/lib/api";

import { ExportFormatPicker } from "./export-format-picker";
import { ExportQueued } from "./export-queued";
import { ExportSummary } from "./export-summary";
import { useExportDraft } from "./use-export-draft";

interface ExportDialogProps {
  /** The element that opens the dialog: the Export button. */
  trigger: ReactElement;
}

/**
 * Export traces (Figma "Traces/Export dialog"): pick a format, check what will be exported, start
 * it. A centred dialog from 640 px, a bottom sheet below. The content is mounted only while the
 * dialog is open, so every opening starts fresh: the filters are read again and the submission gets
 * a new idempotency key.
 */
export function ExportDialog({ trigger }: ExportDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {open ? (
        <ExportDialogContent
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

/** A Radix dismiss handler that cancels the dismissal while `blocked`. */
function blockWhile(blocked: boolean) {
  return (event: Event) => {
    if (blocked) {
      event.preventDefault();
    }
  };
}

function ExportDialogContent({ onClose }: { onClose: () => void }) {
  const live = useExportDraft();
  // What is sent is frozen at opening, so the summary and the request cannot drift apart when the
  // list's "now" moves on; the row count may still arrive afterwards.
  const [filters] = useState(live.filters);
  const draft = { ...live, filters };

  const [format, setFormat] = useState<ExportFormat>("jsonl");
  const submission = useExportSubmission();
  const problem = exportWindowProblem(filters);

  return (
    <DialogContent
      hideClose
      // While the POST is out, closing would drop its idempotency key: a second submit after a
      // reopen could then queue a duplicate. Esc, a click outside and both buttons wait for it.
      onEscapeKeyDown={blockWhile(submission.isPending)}
      onInteractOutside={blockWhile(submission.isPending)}
      className="max-w-[560px] gap-5 rounded-card p-7 max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[calc(100dvh-1rem)] max-sm:w-full max-sm:max-w-none max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-b-none max-sm:p-5 max-sm:pb-7"
    >
      {submission.created ? (
        <>
          <DialogHeading title="Export queued" />
          <ExportQueued format={format} rows={draft.rows} onDone={onClose} />
        </>
      ) : (
        <>
          <DialogHeading
            title="Export traces"
            description="Create a file of the traces that match your current filters. You’ll download it from Settings › Exports."
            closeDisabled={submission.isPending}
          />
          <ExportFormatPicker value={format} onChange={setFormat} />
          <ExportSummary draft={draft} problem={problem} />
          {submission.error ? <SubmitError error={submission.error} /> : null}
          <div className="flex items-center justify-end gap-2.5 max-sm:[&>*]:flex-1">
            <DialogClose asChild>
              <Button variant="secondary" disabled={submission.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              loading={submission.isPending}
              disabled={problem !== null}
              onClick={() => {
                submission.submit({ format, filters });
              }}
            >
              Start export
            </Button>
          </div>
        </>
      )}
    </DialogContent>
  );
}

interface DialogHeadingProps {
  title: string;
  /** Left out in the queued state, where the success tile carries the description. */
  description?: string;
  /** Off while the request is out, so the dialog cannot be closed mid-submit. */
  closeDisabled?: boolean;
}

/** Title, optional description and the round muted close button of the Figma dialog. */
function DialogHeading({ title, description, closeDisabled = false }: DialogHeadingProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </div>
      <DialogClose asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close"
          disabled={closeDisabled}
          className="bg-surface-muted"
        >
          <X aria-hidden />
        </Button>
      </DialogClose>
    </div>
  );
}

/**
 * Why Start export failed. `409 NOT_CONFIGURED` is the warning from the Figma frame: the button
 * stays enabled so the person can try again once storage is set up. Anything else is an error.
 */
function SubmitError({ error }: { error: unknown }) {
  if (isExportNotConfigured(error)) {
    return (
      <Callout tone="warning" role="status" title="Not available on this server">
        Exports need object storage. Ask your administrator to set the S3 settings.
      </Callout>
    );
  }
  return (
    <Callout tone="danger" role="alert" title="Couldn't start the export">
      {errorMessage(error)}
    </Callout>
  );
}
