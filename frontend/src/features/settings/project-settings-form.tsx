import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { useId } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { toast } from "sonner";

import { CopyButton } from "@/components/copy-button";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage, type Project } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { applyServerFieldErrors } from "@/lib/form-errors";

import {
  changedProjectFields,
  isEmptyUpdate,
  PROJECT_NAME_MAX_LENGTH,
  projectSavedMessage,
  projectSettingsSchema,
  RETENTION_MAX_DAYS,
  RETENTION_MIN_DAYS,
  type ProjectSettingsValues,
} from "./project-settings-schema";
import { SettingsSection } from "./settings-section";
import { useUpdateProject } from "./use-update-project";

interface ProjectSettingsFormProps {
  project: Project;
  canEdit: boolean;
}

function valuesFrom(project: Project): ProjectSettingsValues {
  return {
    name: project.name,
    retention_days: project.retention_days,
    capture_payloads: project.capture_payloads,
  };
}

/**
 * The General and Data cards and their save bar. One form, so one "Save changes" sends only
 * the fields that differ from the saved project.
 */
export function ProjectSettingsForm({ project, canEdit }: ProjectSettingsFormProps) {
  const updateProject = useUpdateProject();
  const form = useForm<ProjectSettingsValues>({
    resolver: zodResolver(projectSettingsSchema),
    defaultValues: valuesFrom(project),
  });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    const update = changedProjectFields(project, values);
    if (isEmptyUpdate(update)) {
      form.reset(valuesFrom(project));
      return;
    }
    updateProject.mutate(update, {
      onSuccess: (updated) => {
        form.reset(valuesFrom(updated));
        toast.success(projectSavedMessage(update));
      },
      onError: (error) => {
        if (!applyServerFieldErrors(error, form.setError, ["name", "retention_days"])) {
          toast.error(errorMessage(error));
        }
      },
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <SettingsSection
        title="General"
        description="Shown in the project switcher and the command palette."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Name"
            hint={`Up to ${PROJECT_NAME_MAX_LENGTH} characters.`}
            error={errors.name?.message}
          >
            <Input
              autoComplete="off"
              maxLength={PROJECT_NAME_MAX_LENGTH}
              disabled={!canEdit}
              {...form.register("name")}
            />
          </FormField>
          <FormField
            label="Slug"
            hint={
              <span className="inline-flex items-center gap-1.5">
                <Lock aria-hidden className="size-3 shrink-0" />
                Read-only. Used in API URLs and can&apos;t be changed.
              </span>
            }
          >
            <Input
              readOnly
              value={project.slug}
              className="border-border bg-surface-muted font-mono text-label text-muted-foreground focus-visible:border-border"
            />
          </FormField>
        </div>
        <ProjectIdentifiers project={project} />
      </SettingsSection>

      <SettingsSection
        title="Data"
        description="Control how long traces are kept and what is stored with them."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <FormField
            label="Retention period (days)"
            hint={`${RETENTION_MIN_DAYS}–${RETENTION_MAX_DAYS} days`}
            error={errors.retention_days?.message}
            className="sm:w-[220px] sm:shrink-0"
          >
            <Input
              type="number"
              inputMode="numeric"
              min={RETENTION_MIN_DAYS}
              max={RETENTION_MAX_DAYS}
              step={1}
              disabled={!canEdit}
              className="tabular"
              {...form.register("retention_days", { valueAsNumber: true })}
            />
          </FormField>
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:pt-[30px]">
            <p className="text-sm text-muted-foreground">
              Traces older than this are deleted automatically, in batches, every hour.
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              Shortening the period deletes older traces within the next hour.
            </p>
          </div>
        </div>
        <hr className="border-border" />
        <CapturePayloadsField control={form.control} canEdit={canEdit} />
      </SettingsSection>

      {canEdit ? (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            Payload capture changes apply to spans ingested after you save.
          </p>
          <Button
            type="submit"
            variant="primary"
            disabled={!isDirty}
            loading={updateProject.isPending}
            className="self-end sm:self-auto"
          >
            Save changes
          </Button>
        </div>
      ) : null}
    </form>
  );
}

interface CapturePayloadsFieldProps {
  control: Control<ProjectSettingsValues>;
  canEdit: boolean;
}

function CapturePayloadsField({ control, canEdit }: CapturePayloadsFieldProps) {
  const switchId = useId();
  const descriptionId = useId();

  return (
    <div className="flex items-start gap-4 rounded-tile bg-surface-muted p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label htmlFor={switchId} className="text-sm">
          Capture prompts &amp; completions
        </Label>
        <p id={descriptionId} className="text-sm text-muted-foreground">
          Secrets such as API keys are redacted before storage. Turn off to keep metadata only:
          tokens, cost, latency and model. Existing traces are unaffected.
        </p>
      </div>
      <Controller
        control={control}
        name="capture_payloads"
        render={({ field }) => (
          <Switch
            id={switchId}
            aria-describedby={descriptionId}
            checked={field.value}
            onCheckedChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            disabled={!canEdit}
          />
        )}
      />
    </div>
  );
}

/** The project ID for API calls and support requests, and when the project was created. */
function ProjectIdentifiers({ project }: { project: Project }) {
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border pt-4 text-xs font-medium text-muted-foreground">
      <div className="flex min-w-0 items-center gap-1.5">
        <dt>Project ID</dt>
        <dd className="flex min-w-0 items-center gap-0.5">
          <code className="truncate font-mono text-label text-foreground">{project.id}</code>
          <CopyButton value={project.id} label="Copy project ID" className="size-7" />
        </dd>
      </div>
      <div className="flex items-center gap-1.5">
        <dt>Created</dt>
        <dd className="text-foreground">
          <time dateTime={project.created_at}>{formatDate(project.created_at)}</time>
        </dd>
      </div>
    </dl>
  );
}
