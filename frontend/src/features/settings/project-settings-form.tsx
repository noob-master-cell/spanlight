import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { errorMessage, type Project } from "@/lib/api";
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
import { CapturePayloadsField, ProjectIdentifiers } from "./project-settings-parts";
import { ReadOnlySlugField } from "./read-only-slug-field";
import { SettingsSaveBar } from "./settings-save-bar";
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
          <ReadOnlySlugField
            slug={project.slug}
            hint="Read-only. Used in API URLs and can't be changed."
          />
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
        <SettingsSaveBar
          hint="Payload capture changes apply to spans ingested after you save."
          dirty={isDirty}
          saving={updateProject.isPending}
        />
      ) : null}
    </form>
  );
}
