import { Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useController } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { MAX_RETRY_STATUSES, STATUS_MAX, STATUS_MIN, type RouteFormValues } from "./route-form";

/** Why `raw` can't be added to `statuses`, or null when it can. */
function statusProblem(raw: string, statuses: readonly number[]): string | null {
  const status = Number(raw);
  if (!/^\d+$/.test(raw.trim()) || status < STATUS_MIN || status > STATUS_MAX) {
    return `Enter an HTTP status from ${STATUS_MIN} to ${STATUS_MAX}.`;
  }
  if (statuses.includes(status)) {
    return `${status} is already in the list.`;
  }
  return null;
}

/**
 * "Retry on statuses": removable mono chips (Figma "Gateway/Status code chip", a 24 px remove
 * target) and "Add status", which opens a small input. Sorted, unique, at most 16.
 */
export function StatusChipsField() {
  const labelId = useId();
  const hintId = useId();
  const { field, fieldState } = useController<RouteFormValues, "retry.on_statuses">({
    name: "retry.on_statuses",
  });
  const statuses = field.value;
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const message = problem ?? fieldState.error?.message ?? null;
  const addButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  useEffect(() => {
    // Closing the draft input removes the element that had focus; hand it back to Add status.
    if (draft === null && refocus.current) {
      refocus.current = false;
      addButton.current?.focus();
    }
  }, [draft]);

  function closeDraft() {
    refocus.current = true;
    setDraft(null);
    setProblem(null);
  }

  function add() {
    if (draft === null) {
      return;
    }
    const issue = statusProblem(draft, statuses);
    if (issue) {
      setProblem(issue);
      return;
    }
    field.onChange([...statuses, Number(draft)].sort((a, b) => a - b));
    closeDraft();
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={hintId}
      className="flex flex-col gap-2"
    >
      <span id={labelId} className="text-label leading-5 font-semibold text-foreground">
        Retry on statuses
      </span>
      <ul aria-label="Retry statuses" className="flex flex-wrap items-center gap-2">
        {statuses.map((status) => (
          <li
            key={status}
            className="flex h-8 items-center gap-0.5 rounded-full border border-border-strong bg-surface pr-1 pl-3 font-mono text-label"
          >
            {status}
            <button
              type="button"
              aria-label={`Remove ${status}`}
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              onClick={() => {
                field.onChange(statuses.filter((candidate) => candidate !== status));
              }}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </li>
        ))}
        {draft === null ? (
          statuses.length < MAX_RETRY_STATUSES ? (
            <li>
              <Button
                ref={addButton}
                variant="ghost"
                size="sm"
                className="border border-dashed border-border-strong text-accent"
                onClick={() => {
                  setDraft("");
                }}
              >
                <Plus aria-hidden />
                Add status
              </Button>
            </li>
          ) : (
            <li className="text-xs font-medium text-muted-foreground">
              Up to {MAX_RETRY_STATUSES} statuses.
            </li>
          )
        ) : (
          <li className="flex items-center gap-1.5">
            <Input
              autoFocus
              inputMode="numeric"
              aria-label="New retry status"
              aria-invalid={problem ? true : undefined}
              value={draft}
              className="h-8 w-20 px-3 font-mono text-label"
              onChange={(event) => {
                setDraft(event.target.value);
                setProblem(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  closeDraft();
                }
              }}
            />
            <Button size="sm" variant="secondary" className="shadow-none" onClick={add}>
              Add
            </Button>
          </li>
        )}
      </ul>
      {message ? (
        <p role="alert" className="text-xs font-medium text-danger-text">
          {message}
        </p>
      ) : null}
      <p id={hintId} className="text-xs font-medium text-muted-foreground">
        HTTP statuses from {STATUS_MIN} to {STATUS_MAX}, up to {MAX_RETRY_STATUSES}.
      </p>
    </div>
  );
}
