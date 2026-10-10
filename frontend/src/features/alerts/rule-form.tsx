import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import { Callout } from "@/components/callout";
import { DialogHeading } from "@/components/dialog-heading";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AlertRule } from "@/lib/api";

import { ChannelDialog } from "./channel-dialog";
import { ChannelMultiSelect } from "./channel-multi-select";
import { ConditionFields } from "./condition-fields";
import { FilterFields } from "./filter-fields";
import { KindTabs } from "./kind-tabs";
import { errorSummary, RULE_EDITOR_COPY } from "./rule-form-options";
import {
  EMPTY_RULE_VALUES,
  NAME_MAX_LENGTH,
  ruleFormSchema,
  valuesFromRule,
  type RuleFormValues,
} from "./rule-form-schema";
import { RulePreviewPanel } from "./rule-preview-panel";
import { TimingFields } from "./timing-fields";
import { useAddChannel } from "./use-add-channel";
import { useRuleSubmit } from "./use-rule-submit";

interface RuleFormProps {
  projectId: string;
  /** The rule to edit; omitted to create one. */
  rule: AlertRule | undefined;
  /** Called as the save starts and ends, so the dialog can refuse to close in between. */
  onPendingChange: (pending: boolean) => void;
  onSaved: () => void;
}

/**
 * Figma "Alerts — Rule editor" (threshold, anomaly, validation errors, no channels, empty
 * preview, 375 sheet). Fields validate when they lose focus, and all at once on save; a refused
 * save lists how many fields need fixing above the form. On phones the footer sticks to the
 * bottom of the sheet.
 */
export function RuleForm({ projectId, rule, onPendingChange, onSaved }: RuleFormProps) {
  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: rule ? valuesFromRule(rule) : EMPTY_RULE_VALUES,
    mode: "onTouched",
  });
  const submit = useRuleSubmit(form, projectId, rule, onSaved);
  const addChannel = useAddChannel(form);
  const { errors, submitCount } = form.formState;
  const errorCount = Object.keys(errors).length;
  const editing = rule !== undefined;

  useEffect(() => {
    onPendingChange(submit.pending);
    return () => {
      onPendingChange(false);
    };
  }, [submit.pending, onPendingChange]);

  return (
    <>
      <form onSubmit={submit.onSubmit} noValidate className="flex flex-col gap-5">
        <DialogHeading
          title={rule ? `Edit ${rule.name}` : RULE_EDITOR_COPY.createTitle}
          description={RULE_EDITOR_COPY.description}
          showClose={submit.pending ? "disabled" : true}
        />
        {submit.problem ? (
          <Callout tone="danger" role="alert">
            {submit.problem}
          </Callout>
        ) : submitCount > 0 && errorCount > 0 ? (
          <Callout tone="danger" role="alert">
            {errorSummary(errorCount, editing)}
          </Callout>
        ) : null}
        <FormField label="Name" hint={RULE_EDITOR_COPY.nameHint} error={errors.name?.message}>
          <Input
            autoComplete="off"
            autoFocus
            maxLength={NAME_MAX_LENGTH}
            placeholder={RULE_EDITOR_COPY.namePlaceholder}
            {...form.register("name")}
          />
        </FormField>
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <KindTabs
              value={field.value}
              onChange={(kind) => {
                field.onChange(kind);
                // The other kind's fields are hidden now; their errors would only skew the count.
                form.clearErrors(["threshold", "baselineWindows", "sensitivity"]);
              }}
            />
          )}
        />
        <ConditionFields form={form} />
        <FilterFields form={form} projectId={projectId} />
        <TimingFields form={form} />
        <ChannelMultiSelect form={form} refused={submit.refused} onAddChannel={addChannel.start} />
        <RulePreviewPanel form={form} projectId={projectId} />
        <div className="flex items-center justify-between gap-5 max-sm:contents">
          <Controller
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground">
                <Switch checked={field.value} onCheckedChange={field.onChange} />
                {RULE_EDITOR_COPY.enabled}
              </label>
            )}
          />
          <div className="flex gap-2.5 max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-5 max-sm:border-t max-sm:border-border max-sm:bg-surface max-sm:px-5 max-sm:py-4 max-sm:[&>*]:flex-1">
            <DialogClose asChild>
              <Button disabled={submit.pending}>Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={submit.pending}>
              {editing ? "Save changes" : "Create rule"}
            </Button>
          </div>
        </div>
      </form>
      <ChannelDialog
        channel={null}
        open={addChannel.open}
        onOpenChange={addChannel.onOpenChange}
        onCreated={addChannel.onCreated}
      />
    </>
  );
}
