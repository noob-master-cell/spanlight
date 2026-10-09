import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Key, KeyRound, Lock, TriangleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { CopyButton } from "@/components/copy-button";
import { MeshBackdrop } from "@/components/mesh-backdrop";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { errorMessage, projectsApi, queryKeys, type CreatedApiKey, type Role } from "@/lib/api";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const KEY_NAME_MAX_LENGTH = 100;

const keySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a key name.")
    .max(KEY_NAME_MAX_LENGTH, `Use ${KEY_NAME_MAX_LENGTH} characters or fewer.`),
});

type KeyValues = z.infer<typeof keySchema>;

/** Lime focus ring for controls on the ink card, where the violet ring would be too faint. */
const INK_FOCUS = "focus-visible:outline-lime";

/**
 * The translucent pill that holds the key name input or the revealed secret, with its action
 * on the right. On phones the action drops below at full width.
 */
const KEY_FIELD_CLASSES =
  "flex flex-col gap-2 rounded-[1.75rem] bg-rail-tile p-2 sm:min-h-14 sm:flex-row sm:items-center sm:gap-3 sm:rounded-full sm:py-2 sm:pr-2 sm:pl-5";

interface ApiKeyCardProps {
  projectId: string;
  projectName: string;
  canCreateKeys: boolean;
  role: Role;
  createdKey: CreatedApiKey | null;
  onCreated: (key: CreatedApiKey) => void;
}

/**
 * The ink "API key" card (Figma "API key card"). Creates a key for the project, then shows the
 * secret once with a copy button. The secret lives in the parent's state, never in a cache.
 */
export function ApiKeyCard({
  projectId,
  projectName,
  canCreateKeys,
  role,
  createdKey,
  onCreated,
}: ApiKeyCardProps) {
  let body: ReactNode;
  if (createdKey) {
    body = <SecretReveal apiKey={createdKey} />;
  } else if (canCreateKeys) {
    body = <CreateKeyForm projectId={projectId} onCreated={onCreated} />;
  } else {
    body = (
      <p className="flex items-start gap-2 text-sm text-rail-muted-foreground">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Your role ({ROLE_LABELS[role]}) can't create API keys. Ask an admin or member for a key,
          then use it in place of <code className="text-rail-foreground">&lt;YOUR_API_KEY&gt;</code>{" "}
          below.
        </span>
      </p>
    );
  }

  const subtitle = createdKey ? `${createdKey.name} · ${projectName}` : projectName;

  return (
    <Card variant="hero" className="flex flex-col gap-3.5 overflow-hidden p-5 sm:p-6">
      <MeshBackdrop intensity="soft" className="-top-[300px] right-auto left-[380px]" />

      <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-lime text-lime-foreground"
          >
            <Key className="size-4" strokeWidth={2} />
          </span>
          <h2 className="text-sm font-semibold whitespace-nowrap text-rail-foreground">API key</h2>
          <p className="min-w-0 truncate text-xs font-medium text-rail-muted-foreground">
            {subtitle}
          </p>
        </div>
        {createdKey ? <Badge variant="lime">Created just now</Badge> : null}
      </div>

      <div className="relative">{body}</div>
    </Card>
  );
}

function CreateKeyForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (key: CreatedApiKey) => void;
}) {
  const id = useId();
  const inputId = `${id}-name`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<KeyValues>({
    resolver: zodResolver(keySchema),
    defaultValues: { name: "Onboarding key" },
  });

  const createKey = useMutation({
    mutationFn: (name: string) => projectsApi.createKey(projectId, name),
    onSuccess: (key) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId).keys });
      toast.success("API key created");
      onCreated(key);
    },
    onError: (error) => {
      if (!applyServerFieldErrors(error, form.setError, ["name"])) {
        setFormError(errorMessage(error));
      }
    },
  });

  const onSubmit = form.handleSubmit(({ name }) => {
    setFormError(null);
    createKey.mutate(name);
  });

  const fieldError = form.formState.errors.name?.message;

  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      <label htmlFor={inputId} className="text-label font-semibold text-rail-foreground">
        Key name
      </label>
      {/* The shared Input is drawn for light surfaces; here the pill is the field and owns the ring. */}
      <div
        className={cn(
          KEY_FIELD_CLASSES,
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-lime",
          fieldError && "ring-[1.5px] ring-rail-danger",
        )}
      >
        <input
          id={inputId}
          autoComplete="off"
          maxLength={KEY_NAME_MAX_LENGTH}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errorId : hintId}
          className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-rail-foreground placeholder:text-rail-subtle-foreground focus-visible:outline-none sm:px-0"
          {...form.register("name")}
        />
        <Button
          type="submit"
          variant="highlight"
          loading={createKey.isPending}
          className={cn("w-full sm:w-auto", INK_FOCUS)}
        >
          {createKey.isPending ? null : <KeyRound aria-hidden />}
          Create API key
        </Button>
      </div>
      {fieldError ? (
        <p id={errorId} className="flex items-start gap-1.5 text-xs font-medium text-rail-danger">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2.25} />
          {fieldError}
        </p>
      ) : (
        <p id={hintId} className="text-sm text-rail-muted-foreground">
          Shown in Settings → API keys so you can revoke it later.
        </p>
      )}
      {formError ? (
        <Notice tone="danger" role="alert" className="mt-1">
          {formError}
        </Notice>
      ) : null}
    </form>
  );
}

/** The one and only time the secret is shown. */
function SecretReveal({ apiKey }: { apiKey: CreatedApiKey }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className={KEY_FIELD_CLASSES}>
        <code className="min-w-0 flex-1 px-3 py-1 text-code break-all text-rail-foreground sm:px-0">
          {apiKey.secret}
        </code>
        <CopyButton
          value={apiKey.secret}
          label="Copy"
          aria-label="Copy API key"
          showLabel
          variant="highlight"
          size="md"
          className={cn("w-full sm:w-auto [&_svg]:text-lime-foreground", INK_FOCUS)}
        />
      </div>
      <p className="flex items-start gap-2 text-sm text-rail-muted-foreground">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-lime" strokeWidth={2} />
        This key is shown once. Store it in your secrets manager.
      </p>
    </div>
  );
}
