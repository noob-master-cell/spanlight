import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert, X } from "lucide-react";
import { useState, type ReactElement, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { CopyButton } from "@/components/copy-button";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage, type CreatedApiKey } from "@/lib/api";
import { applyServerFieldErrors } from "@/lib/form-errors";

import { useCreateApiKey } from "./api-key-queries";
import { envLine } from "./api-key-utils";

const KEY_NAME_MAX_LENGTH = 100;

const createKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name for this key.")
    .max(KEY_NAME_MAX_LENGTH, `Use ${KEY_NAME_MAX_LENGTH} characters or fewer.`),
});

type CreateKeyValues = z.infer<typeof createKeySchema>;

interface CreateApiKeyDialogProps {
  trigger: ReactElement;
}

/**
 * Two steps in one dialog: name the key, then show its secret once. The secret
 * lives only in the dialog body's state, which unmounts when the dialog closes.
 */
export function CreateApiKeyDialog({ trigger }: CreateApiKeyDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* Mounted only while open, so closing the dialog discards the secret. */}
      {open ? <CreateApiKeyDialogBody /> : null}
    </Dialog>
  );
}

function CreateApiKeyDialogBody() {
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);

  return (
    <DialogContent
      hideClose
      className="max-w-[560px] gap-[18px] p-6 sm:p-7"
      onInteractOutside={(event) => {
        // A stray click outside would lose the secret for good.
        if (createdKey) {
          event.preventDefault();
        }
      }}
    >
      {createdKey ? (
        <KeyCreatedView createdKey={createdKey} />
      ) : (
        <CreateKeyForm onCreated={setCreatedKey} />
      )}
    </DialogContent>
  );
}

/** Title, description and the round muted close button from the Figma dialog. */
function DialogHeading({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </div>
      <DialogClose asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Close" className="bg-surface-muted">
          <X aria-hidden />
        </Button>
      </DialogClose>
    </div>
  );
}

function CreateKeyForm({ onCreated }: { onCreated: (key: CreatedApiKey) => void }) {
  const createKey = useCreateApiKey();
  const form = useForm<CreateKeyValues>({
    resolver: zodResolver(createKeySchema),
    defaultValues: { name: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    createKey.mutate(values.name, {
      onSuccess: (key) => {
        onCreated(key);
        createKey.reset();
        toast.success(`Created API key "${key.name}".`);
      },
      onError: (error) => {
        if (!applyServerFieldErrors(error, form.setError, ["name"])) {
          toast.error(errorMessage(error));
        }
      },
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-[18px]">
      <DialogHeading
        title="Create API key"
        description="The key lets an application send traces to this project."
      />
      <FormField
        label="Name"
        hint="Name it after where it's used, for example production-api."
        error={form.formState.errors.name?.message}
      >
        <Input
          autoComplete="off"
          autoFocus
          maxLength={KEY_NAME_MAX_LENGTH}
          placeholder="production-api"
          {...form.register("name")}
        />
      </FormField>
      <DialogFooter>
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={createKey.isPending}>
          Create key
        </Button>
      </DialogFooter>
    </form>
  );
}

function KeyCreatedView({ createdKey }: { createdKey: CreatedApiKey }) {
  const env = envLine(createdKey.secret);

  return (
    <div className="grid gap-[18px]">
      <DialogHeading
        title="Key created"
        description={
          <>
            <span className="font-semibold text-foreground">{createdKey.name}</span> is ready to
            use.
          </>
        }
      />

      <p className="flex items-center gap-2.5 rounded-input bg-warning-subtle px-3.5 py-2.5 text-sm font-medium text-warning">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        Copy this key now. You won&apos;t be able to see it again.
      </p>

      <div className="grid gap-2">
        <p className="text-xs font-medium text-muted-foreground">Secret key</p>
        <div className="flex items-center gap-3 rounded-tile bg-hero-card py-3.5 pr-3 pl-[18px] text-hero-card-foreground">
          <code
            aria-label="API key"
            className="min-w-0 flex-1 font-mono text-code break-all select-all"
          >
            {createdKey.secret}
          </code>
          <CopyButton
            value={createdKey.secret}
            label="Copy"
            aria-label="Copy API key"
            showLabel
            variant="highlight"
            autoFocus
            className="h-[34px] px-3.5 text-sm [&_svg]:size-3.5 [&_svg]:text-lime-foreground"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Set it in your application&apos;s environment. The SDK reads it automatically:
        </p>
        <div className="flex items-center gap-2.5 rounded-input border border-border bg-surface-muted py-2.5 pr-2 pl-3.5">
          <code className="min-w-0 flex-1 font-mono text-label break-all text-foreground">
            {env}
          </code>
          <CopyButton
            value={env}
            label="Copy environment variable"
            variant="secondary"
            className="size-[30px] shadow-none [&_svg]:size-3.5"
          />
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="primary">Done</Button>
        </DialogClose>
      </DialogFooter>
    </div>
  );
}
