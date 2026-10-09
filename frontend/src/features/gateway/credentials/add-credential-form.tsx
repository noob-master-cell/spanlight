import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Callout } from "@/components/callout";
import { DialogHeading } from "@/components/dialog-heading";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { errorMessage, type ProviderKind } from "@/lib/api";
import { applyMappedFieldErrors } from "@/lib/form-errors";

import {
  API_KEY_HINT,
  API_KEY_MAX_LENGTH,
  BASE_URL_HINT,
  BASE_URL_MAX_LENGTH,
  CREDENTIAL_FIELD_OF_API_FIELD,
  CREDENTIAL_NAME_MAX_LENGTH,
  PROVIDER_HINTS,
  PROVIDER_LABELS,
  credentialSchema,
  needsBaseUrl,
  toCredentialCreate,
  type CredentialValues,
} from "./credential-form";
import { NOT_CONFIGURED_COPY, isNameTaken, isNotConfigured } from "./credential-model";
import { ApiKeyInput } from "./api-key-input";
import { useCreateCredential } from "./credentials-queries";

const PROVIDER_OPTIONS = (Object.keys(PROVIDER_LABELS) as ProviderKind[]).map((value) => ({
  value,
  label: PROVIDER_LABELS[value],
}));

interface AddCredentialFormProps {
  orgName: string | null;
  /** Called as the request starts and ends, so the dialog can refuse to close in between. */
  onPendingChange: (pending: boolean) => void;
  onDone: () => void;
  onNotConfigured: () => void;
}

/**
 * Figma "Credentials — Add credential dialog" (Anthropic and OpenAI-compatible variants): name,
 * provider, API key and, for OpenAI-compatible servers only, a base URL. The key field is a
 * password input that is never filled back in, and the form clears once the key is stored.
 */
export function AddCredentialForm({
  orgName,
  onPendingChange,
  onDone,
  onNotConfigured,
}: AddCredentialFormProps) {
  const createCredential = useCreateCredential();
  const pending = createCredential.pending;
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    onPendingChange(pending);
    return () => {
      onPendingChange(false);
    };
  }, [pending, onPendingChange]);

  const form = useForm<CredentialValues>({
    resolver: zodResolver(credentialSchema),
    defaultValues: { name: "", provider: "openai", apiKey: "", baseUrl: "" },
  });
  const provider = useWatch({ control: form.control, name: "provider" });
  const notConfigured = form.formState.errors.root?.type === "not-configured";

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await createCredential.run(toCredentialCreate(values));
    setRevealed(false);
    if (result.ok) {
      form.reset();
      toast.success(`Added credential "${result.value.name}".`);
      onDone();
      return;
    }
    // The typed key stays out of the page once it has been sent, whatever the answer.
    form.resetField("apiKey");
    if (isNotConfigured(result.error)) {
      form.setError("root", { type: "not-configured" });
      onNotConfigured();
    } else if (isNameTaken(result.error)) {
      form.setError("name", { type: "server", message: errorMessage(result.error) });
    } else if (
      !applyMappedFieldErrors(result.error, form.setError, CREDENTIAL_FIELD_OF_API_FIELD)
    ) {
      toast.error(errorMessage(result.error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-[22px]">
      <DialogHeading
        title="Add credential"
        description={`A provider API key that every project in ${orgName ?? "your organization"} can route calls to.`}
        showClose={pending ? "disabled" : true}
      />
      {notConfigured ? (
        <Callout tone="warning" role="alert">
          {NOT_CONFIGURED_COPY}
        </Callout>
      ) : null}
      <FormField
        label="Name"
        hint={`Shown in routes. Unique in ${orgName ?? "your organization"}.`}
        error={form.formState.errors.name?.message}
      >
        <Input
          autoComplete="off"
          autoFocus
          maxLength={CREDENTIAL_NAME_MAX_LENGTH}
          placeholder="openai-prod"
          {...form.register("name")}
        />
      </FormField>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground" id="credential-provider-label">
          Provider
        </p>
        <SegmentedControl
          aria-label="Provider"
          tone="surface"
          value={provider}
          options={PROVIDER_OPTIONS}
          onValueChange={(next) => {
            form.setValue("provider", next);
            form.clearErrors("baseUrl");
          }}
          className="max-w-full flex-wrap self-start"
        />
        {PROVIDER_HINTS[provider] ? (
          <p className="text-xs font-medium text-muted-foreground">{PROVIDER_HINTS[provider]}</p>
        ) : null}
      </div>
      <FormField label="API key" hint={API_KEY_HINT} error={form.formState.errors.apiKey?.message}>
        <ApiKeyInput
          revealed={revealed}
          onRevealedChange={setRevealed}
          maxLength={API_KEY_MAX_LENGTH * 2}
          {...form.register("apiKey")}
        />
      </FormField>
      {needsBaseUrl(provider) ? (
        <FormField
          label="Base URL"
          hint={BASE_URL_HINT}
          error={form.formState.errors.baseUrl?.message}
        >
          <Input
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            maxLength={BASE_URL_MAX_LENGTH}
            placeholder="https://llm.example.com/v1"
            {...form.register("baseUrl")}
          />
        </FormField>
      ) : null}
      <DialogFooter className="flex-row justify-end gap-2.5 max-sm:[&>*]:flex-1">
        <DialogClose asChild>
          <Button disabled={pending}>Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={pending}>
          Add credential
        </Button>
      </DialogFooter>
    </form>
  );
}
