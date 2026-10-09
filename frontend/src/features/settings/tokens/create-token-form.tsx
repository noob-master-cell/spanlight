import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DialogHeading } from "@/components/dialog-heading";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage, type CreatedPersonalAccessToken, type TokenScope } from "@/lib/api";
import { applyServerFieldErrors } from "@/lib/form-errors";

import { ExpiryField } from "./expiry-field";
import { DEFAULT_EXPIRY, expiryTimestamp, type ExpiryChoice } from "./expiry";
import { ScopeChoice } from "./scope-choice";
import { DEFAULT_TOKEN_SCOPE } from "./scopes";
import { useCreateToken } from "./token-queries";

const TOKEN_NAME_MAX_LENGTH = 100;

const createTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name for this token.")
    .max(TOKEN_NAME_MAX_LENGTH, `Use ${TOKEN_NAME_MAX_LENGTH} characters or fewer.`),
});

type CreateTokenValues = z.infer<typeof createTokenSchema>;

interface CreateTokenFormProps {
  /** Called as the request starts and ends, so the dialog can refuse to close in between. */
  onPendingChange: (pending: boolean) => void;
  /** Hands over the created token, whole secret included. The caller keeps it in state only. */
  onCreated: (token: CreatedPersonalAccessToken) => void;
}

/** Figma "Create token dialog": a name, Read or Write, and when it ends. */
export function CreateTokenForm({ onCreated, onPendingChange }: CreateTokenFormProps) {
  const create = useCreateToken();
  const [scope, setScope] = useState<TokenScope>(DEFAULT_TOKEN_SCOPE);
  const [expiry, setExpiry] = useState<ExpiryChoice>(DEFAULT_EXPIRY);
  const pending = create.pending;

  // A request that outlives the dialog would make a credential nobody sees.
  useEffect(() => {
    onPendingChange(pending);
    return () => {
      onPendingChange(false);
    };
  }, [pending, onPendingChange]);

  const form = useForm<CreateTokenValues>({
    resolver: zodResolver(createTokenSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await create.run({
      name: values.name,
      scope,
      expires_at: expiryTimestamp(expiry),
    });
    if (result.ok) {
      onCreated(result.value);
      toast.success(`Created token "${result.value.name}".`);
    } else if (!applyServerFieldErrors(result.error, form.setError, ["name"])) {
      toast.error(errorMessage(result.error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-[22px]">
      <DialogHeading
        showClose={pending ? "disabled" : true}
        title="Create a token"
        description="Scripts and tools use it to call the Spanlight API as you."
      />
      <FormField
        label="Name"
        hint="Name it after where it's used, for example ci-release."
        error={form.formState.errors.name?.message}
      >
        <Input
          autoComplete="off"
          autoFocus
          maxLength={TOKEN_NAME_MAX_LENGTH}
          placeholder="ci-release"
          {...form.register("name")}
        />
      </FormField>
      <ScopeChoice value={scope} onChange={setScope} />
      <ExpiryField value={expiry} onChange={setExpiry} />
      <DialogFooter className="flex-row justify-end gap-2.5 max-sm:[&>*]:flex-1">
        <DialogClose asChild>
          <Button disabled={pending}>Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={pending}>
          Create token
        </Button>
      </DialogFooter>
    </form>
  );
}
