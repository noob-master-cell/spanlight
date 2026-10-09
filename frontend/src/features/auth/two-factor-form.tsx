import { CircleAlert } from "lucide-react";
import { useId, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { CodeInput } from "./code-input";
import { failureMessage } from "./two-factor-flow";
import type { TwoFactorFlow } from "./use-two-factor-flow";

interface TwoFactorFormProps {
  flow: TwoFactorFlow;
  /** The id of the visible instruction above the form, which is the field's label. */
  instructionId: string;
  /** The field's element, which the flow focuses and selects. */
  inputRef: RefObject<HTMLInputElement | null>;
}

/** The line under a field saying what went wrong. A live region, so it is read out when it appears. */
function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-xs font-medium text-danger-text"
    >
      <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2.25} />
      {message}
    </p>
  );
}

/**
 * The code field, Verify, and the switch between the authenticator code and a recovery code. The
 * app's code is one input drawn as six cells; a recovery code is an ordinary text field.
 */
export function TwoFactorForm({ flow, instructionId, inputRef }: TwoFactorFormProps) {
  const errorId = useId();
  const recoveryId = useId();
  const message = flow.failure ? failureMessage(flow.failure, flow.mode) : undefined;

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        flow.submit();
      }}
    >
      {flow.mode === "code" ? (
        <div className="flex flex-col gap-2.5">
          <CodeInput
            value={flow.code}
            onChange={flow.setCode}
            invalid={flow.failure?.kind === "wrong-code"}
            input={{
              ref: inputRef,
              "aria-labelledby": instructionId,
              "aria-describedby": message ? errorId : undefined,
            }}
          />
          {message ? <FieldError id={errorId} message={message} /> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor={recoveryId}>Recovery code</Label>
          <Input
            id={recoveryId}
            ref={inputRef}
            value={flow.code}
            onChange={(event) => {
              flow.setCode(event.target.value);
            }}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? errorId : undefined}
            className="font-mono text-[15px] font-medium tracking-[0.04em]"
          />
          {message ? <FieldError id={errorId} message={message} /> : null}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={flow.pending}
          disabled={!flow.canSubmit}
        >
          Verify
        </Button>
        <Button variant="link" className="min-h-11 self-center" onClick={flow.switchMode}>
          {flow.mode === "code"
            ? "Use a recovery code instead"
            : "Use your authenticator app instead"}
        </Button>
      </div>
    </form>
  );
}
