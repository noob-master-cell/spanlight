import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Callout } from "@/components/callout";
import { DialogHeading } from "@/components/dialog-heading";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useCurrentOrg } from "@/features/shell";
import type { AlertChannel, AlertChannelKind, AlertChannelWithSecret } from "@/lib/api";

import { ChannelKindFields } from "./channel-kind-fields";
import { CHANNEL_COPY, KIND_LABELS } from "./channel-kinds";
import {
  CHANNEL_KINDS,
  CHANNEL_NAME_MAX_LENGTH,
  EMPTY_CHANNEL_VALUES,
  channelFormSchema,
  needsCredentialsKey,
  valuesFromChannel,
  type ChannelFormValues,
} from "./channel-schema";
import { useChannelSubmit, type FormProblem } from "./use-channel-submit";

interface ChannelFormProps {
  /** Null to add a channel. */
  channel: AlertChannel | null;
  /** Called as the request starts and ends, so the dialog can refuse to close in between. */
  onPendingChange: (pending: boolean) => void;
  onSaved: (saved: AlertChannelWithSecret) => void;
}

/**
 * The channel dialog's form: type tabs (locked on edit), name, then the type's own fields. Slack,
 * webhook and PagerDuty need the server's credentials key; without it the frame's notice shows
 * and the submit button stays disabled for those types.
 */
export function ChannelForm({ channel, onPendingChange, onSaved }: ChannelFormProps) {
  const orgName = useCurrentOrg()?.name ?? "your organization";
  const mode = channel ? "edit" : "create";
  const form = useForm<ChannelFormValues>({
    resolver: zodResolver(channelFormSchema(mode)),
    defaultValues: channel ? valuesFromChannel(channel) : EMPTY_CHANNEL_VALUES,
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const submit = useChannelSubmit(form, channel, orgName, onSaved);
  const problem = visibleProblem(submit.problem, kind);
  const blocked = problem?.kind === "not-configured";

  useEffect(() => {
    onPendingChange(submit.pending);
    return () => {
      onPendingChange(false);
    };
  }, [submit.pending, onPendingChange]);

  return (
    <form onSubmit={submit.onSubmit} noValidate className="grid gap-[22px]">
      <DialogHeading
        title={channel ? `Edit ${channel.name}` : CHANNEL_COPY.createTitle}
        description={CHANNEL_COPY.description}
        showClose={submit.pending ? "disabled" : true}
      />
      {problem ? <ProblemCallout problem={problem} /> : null}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">Type</p>
        <SegmentedControl
          aria-label="Type"
          tone="surface"
          value={kind}
          options={CHANNEL_KINDS.map((value) => ({
            value,
            label: KIND_LABELS[value],
            disabled: channel !== null,
          }))}
          onValueChange={(next) => {
            form.setValue("kind", next);
            form.clearErrors();
          }}
          className="grid w-full grid-cols-2 sm:grid-cols-4"
        />
        {channel ? (
          <p className="text-xs font-medium text-muted-foreground">{CHANNEL_COPY.kindLocked}</p>
        ) : null}
      </div>
      <FormField
        label="Name"
        hint={CHANNEL_COPY.nameHint}
        error={form.formState.errors.name?.message}
      >
        <Input
          autoComplete="off"
          autoFocus
          maxLength={CHANNEL_NAME_MAX_LENGTH}
          placeholder="ops-oncall"
          {...form.register("name")}
        />
      </FormField>
      <ChannelKindFields form={form} channel={channel} refused={submit.refused} />
      <DialogFooter className="flex-row justify-end gap-2.5 max-sm:[&>*]:flex-1">
        <DialogClose asChild>
          <Button disabled={submit.pending}>Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={submit.pending} disabled={blocked}>
          {channel ? "Save changes" : "Add channel"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * A missing server key blocks every secret-bearing type and a missing email provider blocks email,
 * so a "not configured" answer stays relevant only while the type needs the same thing.
 */
function visibleProblem(problem: FormProblem | null, kind: AlertChannelKind): FormProblem | null {
  if (problem?.kind !== "not-configured") {
    return problem;
  }
  return needsCredentialsKey(problem.forKind) === needsCredentialsKey(kind) ? problem : null;
}

function ProblemCallout({ problem }: { problem: FormProblem }) {
  if (problem.kind === "not-configured" && needsCredentialsKey(problem.forKind)) {
    return (
      <Callout tone="warning" role="alert" title={CHANNEL_COPY.notConfiguredTitle}>
        {CHANNEL_COPY.notConfiguredBody}
      </Callout>
    );
  }
  return (
    <Callout tone={problem.kind === "not-configured" ? "warning" : "danger"} role="alert">
      {problem.message}
    </Callout>
  );
}
