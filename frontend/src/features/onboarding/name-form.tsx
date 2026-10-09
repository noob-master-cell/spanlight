import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { applyServerFieldErrors } from "@/lib/form-errors";

const NAME_MAX_LENGTH = 100;

function nameSchema(noun: string) {
  const article = /^[aeiou]/i.test(noun) ? "an" : "a";
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, `Enter ${article} ${noun} name.`)
      .max(NAME_MAX_LENGTH, `Use ${NAME_MAX_LENGTH} characters or fewer.`),
  });
}

type NameValues = z.infer<ReturnType<typeof nameSchema>>;

interface NameFormProps {
  /** Lowercase noun used in validation messages, e.g. "organization". */
  noun: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel: string;
  /**
   * Extra words for screen readers describing what the submit button does, for a short
   * visible label such as "Continue".
   */
  submitDescription?: string;
  /** Performs the create call. Rejections are shown inline on the form. */
  onCreate: (name: string) => Promise<unknown>;
}

/** The single-field "name it" form used by the organization and project steps. */
export function NameForm({
  noun,
  label,
  defaultValue = "",
  placeholder,
  submitLabel,
  submitDescription,
  onCreate,
}: NameFormProps) {
  const descriptionId = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<NameValues>({
    resolver: zodResolver(nameSchema(noun)),
    defaultValues: { name: defaultValue },
  });

  const onSubmit = form.handleSubmit(async ({ name }) => {
    setFormError(null);
    try {
      await onCreate(name);
    } catch (error) {
      if (!applyServerFieldErrors(error, form.setError, ["name"])) {
        setFormError(errorMessage(error));
      }
    }
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-7"
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      {/* min-h-20 matches the design's 80px field block, which leaves room for a message. */}
      <FormField label={label} error={form.formState.errors.name?.message} className="min-h-20">
        <Input
          autoComplete="off"
          maxLength={NAME_MAX_LENGTH}
          placeholder={placeholder}
          {...form.register("name")}
        />
      </FormField>

      {formError ? (
        <Notice tone="danger" role="alert">
          {formError}
        </Notice>
      ) : null}

      <div>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={form.formState.isSubmitting}
          aria-describedby={submitDescription ? descriptionId : undefined}
          className="w-full sm:w-auto"
        >
          {submitLabel}
        </Button>
        {submitDescription ? (
          <span id={descriptionId} className="sr-only">
            {submitDescription}
          </span>
        ) : null}
      </div>
    </form>
  );
}
