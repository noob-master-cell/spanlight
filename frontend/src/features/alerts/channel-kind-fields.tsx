import { Lock } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AlertChannel } from "@/lib/api";
import { cn } from "@/lib/utils";

import { CHANNEL_COPY } from "./channel-kinds";
import { URL_MAX_LENGTH, type ChannelFormValues } from "./channel-schema";
import { RecipientField } from "./recipient-field";
import { RotateSecretDialog } from "./rotate-secret-dialog";
import { SeveritySelect } from "./severity-select";

interface ChannelKindFieldsProps {
  form: UseFormReturn<ChannelFormValues>;
  /** The channel being edited, or null for a new one. */
  channel: AlertChannel | null;
  /** Recipients the server refused on the last save. */
  refused: readonly string[];
}

/** The fields of the selected type (Figma channel dialogs: email, Slack, webhook, PagerDuty). */
export function ChannelKindFields({ form, channel, refused }: ChannelKindFieldsProps) {
  const kind = useWatch({ control: form.control, name: "kind" });
  const errors = form.formState.errors;
  const editing = channel !== null;

  switch (kind) {
    case "email":
      return (
        <Controller
          control={form.control}
          name="recipients"
          render={({ field, fieldState }) => (
            <RecipientField
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error?.message}
              refused={refused}
            />
          )}
        />
      );
    case "slack":
      return (
        <FormField
          label="Webhook URL"
          hint={CHANNEL_COPY.slackHint}
          error={errors.slackUrl?.message}
        >
          <SecretInput
            placeholder={
              editing ? CHANNEL_COPY.storedPlaceholder : "https://hooks.slack.com/services/…"
            }
            maxLength={URL_MAX_LENGTH}
            {...form.register("slackUrl")}
          />
        </FormField>
      );
    case "webhook":
      return (
        <>
          <FormField
            label="Endpoint URL"
            hint={editing ? CHANNEL_COPY.webhookEditHint : CHANNEL_COPY.webhookHint}
            error={errors.webhookUrl?.message}
          >
            <Input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              maxLength={URL_MAX_LENGTH}
              placeholder="https://hooks.example.com/spanlight"
              className="font-mono text-[13px]"
              {...form.register("webhookUrl")}
            />
          </FormField>
          {channel ? <SigningSecretRow channel={channel} /> : null}
        </>
      );
    case "pagerduty":
      return (
        <>
          <FormField
            label="Routing key"
            hint={CHANNEL_COPY.routingKeyHint}
            error={errors.routingKey?.message}
          >
            <SecretInput
              placeholder={editing ? CHANNEL_COPY.storedPlaceholder : "32 letters and digits"}
              maxLength={64}
              {...form.register("routingKey")}
            />
          </FormField>
          <Controller
            control={form.control}
            name="severity"
            render={({ field }) => (
              <FormField label="Severity" hint={CHANNEL_COPY.severityHint}>
                <SeveritySelect value={field.value} onChange={field.onChange} />
              </FormField>
            )}
          />
        </>
      );
  }
}

/** A Slack URL or routing key: masked, mono, and kept out of password managers. */
function SecretInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <Input
      type="password"
      // Password managers ignore "off" on password inputs and offer to save the secret.
      autoComplete="new-password"
      data-1p-ignore
      data-lpignore="true"
      autoCapitalize="off"
      spellCheck={false}
      className={cn("font-mono text-[13px]", className)}
      {...props}
    />
  );
}

/** Figma "webhook — edit": the secret is set and never shown; Rotate secret replaces it. */
function SigningSecretRow({ channel }: { channel: AlertChannel }) {
  const [rotating, setRotating] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground">Signing secret</p>
      <div className="flex items-center gap-3 rounded-tile bg-surface-muted py-2 pr-2 pl-4">
        <Lock aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
          {CHANNEL_COPY.secretSet}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setRotating(true);
          }}
        >
          Rotate secret
        </Button>
      </div>
      <RotateSecretDialog channel={channel} open={rotating} onOpenChange={setRotating} />
    </div>
  );
}
