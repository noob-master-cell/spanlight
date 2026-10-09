import { CircleAlert } from "lucide-react";
import { useId, type Ref } from "react";

import { CodeInput } from "@/features/auth";

interface TotpConfirmStepProps {
  code: string;
  onChange: (value: string) => void;
  /** Why the last try failed, or null while there is nothing to say. */
  message: string | null;
  /** The code was refused, so the cells are red. A message with no refusal leaves them plain. */
  invalid: boolean;
  inputRef: Ref<HTMLInputElement>;
}

/** Step 2: type the first code from the app to prove it was set up. */
export function TotpConfirmStep({
  code,
  onChange,
  message,
  invalid,
  inputRef,
}: TotpConfirmStepProps) {
  const labelId = useId();
  const noteId = useId();

  return (
    <div className="flex flex-col gap-2.5">
      <p id={labelId} className="text-sm font-semibold text-foreground">
        Authentication code
      </p>
      <CodeInput
        value={code}
        onChange={onChange}
        invalid={invalid}
        size="md"
        input={{ ref: inputRef, "aria-labelledby": labelId, "aria-describedby": noteId }}
      />
      {message ? (
        <p
          id={noteId}
          role="alert"
          className="flex items-start gap-2 text-sm font-medium text-danger-text"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          {message}
        </p>
      ) : (
        <p id={noteId} className="text-xs font-medium text-muted-foreground">
          Codes from your authenticator app only. Recovery codes come next.
        </p>
      )}
    </div>
  );
}
