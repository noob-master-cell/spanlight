import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { DialogHeading } from "@/components/dialog-heading";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { errorMessage, isApiError, type FaultProfile, type FaultScenario } from "@/lib/api";
import { applyMappedFieldErrors } from "@/lib/form-errors";
import { toLocalInputValue } from "@/lib/time-range";

import { AttachKeysSection } from "./attach-keys-section";
import {
  defaultExpiryInput,
  expiryInputToIso,
  PROFILE_NAME_MAX_LENGTH,
  profileFormSchema,
  type ProfileFormValues,
} from "./lab-profile";
import { useSaveFaultProfile } from "./lab-queries";
import {
  isProductionKeyFailure,
  keyFailureMessage,
  PROFILE_FIELD_OF_API_FIELD,
  profileParamErrors,
} from "./profile-errors";
import { ProbabilityField } from "./probability-field";
import { ProfileFooter } from "./profile-footer";
import { ProfileScheduleFields } from "./profile-schedule-fields";
import { ScenarioParamsFields } from "./scenario-params-fields";
import { ScenarioPicker } from "./scenario-picker";
import {
  defaultParamText,
  parseParams,
  parsePercentText,
  percentToProbability,
  probabilityToPercent,
  storedParamText,
  type ParamText,
} from "./scenario-params";

interface ProfileFormProps {
  /** The profile to edit; omitted for a new one. */
  profile?: FaultProfile | undefined;
  /** Called as a request starts and ends, so the dialog can refuse to close in between. */
  onPendingChange: (pending: boolean) => void;
  onDone: () => void;
}

/**
 * Figma "New fault profile" and "Edit fault profile": one form for both. Once a new profile is
 * saved the form carries on as that profile's edit form, so a retry after a failed key update
 * saves the profile again instead of creating a second one.
 */
export function ProfileForm({ profile, onPendingChange, onDone }: ProfileFormProps) {
  const save = useSaveFaultProfile();
  const [expiresInput, setExpiresInput] = useState<HTMLInputElement | null>(null);

  const [saved, setSaved] = useState(profile);
  const [attached, setAttached] = useState<readonly string[]>(profile?.attached_key_ids ?? []);
  const [keyErrors, setKeyErrors] = useState<Record<string, string>>({});
  const [scenario, setScenario] = useState<FaultScenario>(profile?.scenario ?? "rate_limited");
  const [paramText, setParamText] = useState<ParamText>(() =>
    profile ? storedParamText(profile.scenario, profile.params) : defaultParamText("rate_limited"),
  );
  const [paramErrors, setParamErrors] = useState<Record<string, string>>({});
  const [keyIds, setKeyIds] = useState<ReadonlySet<string>>(
    () => new Set(profile?.attached_key_ids ?? []),
  );

  const storedExpiry = saved?.expires_at ? toLocalInputValue(saved.expires_at) : null;
  const form = useForm<ProfileFormValues>({
    // Built at each validation, so "in the future" is judged against the time of the save.
    resolver: (values, context, options) =>
      zodResolver(profileFormSchema(storedExpiry))(values, context, options),
    defaultValues: {
      name: profile?.name ?? "",
      percent: String(probabilityToPercent(profile?.probability ?? 0.25)),
      enabled: profile?.enabled ?? true,
      expiresAt: profile ? (storedExpiry ?? "") : defaultExpiryInput(),
    },
  });
  const expiresRegister = form.register("expiresAt");

  const percent = useWatch({ control: form.control, name: "percent" });
  const pending = save.isPending;
  useEffect(() => {
    onPendingChange(pending);
    return () => {
      onPendingChange(false);
    };
  }, [pending, onPendingChange]);

  function changeScenario(next: FaultScenario) {
    setScenario(next);
    setParamText(defaultParamText(next));
    setParamErrors({});
  }

  function toggleKey(keyId: string, checked: boolean) {
    setKeyIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(keyId);
      } else {
        next.delete(keyId);
      }
      return next;
    });
    setKeyErrors(({ [keyId]: _cleared, ...rest }) => rest);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    // A half-typed date reads as "" in the field's value; the input itself knows it is not empty.
    if (expiresInput?.validity.badInput) {
      form.setError("expiresAt", {
        message: "Enter a complete date and time, or clear the field.",
      });
      return;
    }
    const parsed = parseParams(scenario, paramText);
    if (!parsed.ok) {
      setParamErrors(parsed.errors);
      return;
    }
    const percentValue = parsePercentText(values.percent);
    const probability = percentValue === null ? null : percentToProbability(percentValue);
    if (probability === null) {
      return;
    }
    const expiresAt = expiryInputToIso(values.expiresAt);
    const body = {
      name: values.name.trim(),
      scenario,
      params: parsed.params,
      probability,
      enabled: values.enabled,
    };

    let result;
    try {
      result = await save.mutateAsync({
        profileId: saved?.id ?? null,
        create: { ...body, expires_at: expiresAt },
        // An untouched expiry is left out: it may already have passed.
        update: values.expiresAt === storedExpiry ? body : { ...body, expires_at: expiresAt },
        keyIds: [...keyIds],
        previousKeyIds: attached,
      });
    } catch (error) {
      showSaveError(error, body.name);
      return;
    }

    setSaved(result.profile);
    setAttached(result.attachedKeyIds);
    if (result.failures.length === 0) {
      setKeyErrors({});
      toast.success(saved ? `Saved "${body.name}".` : `Created fault profile "${body.name}".`);
      onDone();
      return;
    }
    // The profile is saved and the other keys are updated; the failed ones stay ticked for a retry.
    setKeyErrors(
      Object.fromEntries(
        result.failures.map(({ keyId, error }) => [keyId, keyFailureMessage(error)]),
      ),
    );
    setKeyIds((current) => {
      const next = new Set(current);
      for (const { keyId, error } of result.failures) {
        if (isProductionKeyFailure(error)) {
          next.delete(keyId);
        }
      }
      return next;
    });
    const count = result.failures.length;
    toast.error(
      `Saved "${body.name}", but ${count} ${count === 1 ? "key" : "keys"} couldn't be updated.`,
    );
  });

  function showSaveError(error: unknown, name: string) {
    if (isApiError(error) && error.code === "FAULT_PROFILE_NAME_TAKEN") {
      form.setError("name", {
        message: `A fault profile named ${name} already exists. Pick another name.`,
      });
      return;
    }
    const params = profileParamErrors(error);
    const applied = applyMappedFieldErrors(error, form.setError, PROFILE_FIELD_OF_API_FIELD);
    if (!applied && Object.keys(params).length === 0) {
      toast.error(errorMessage(error));
      return;
    }
    setParamErrors(params);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-[22px]">
      <DialogHeading
        showClose={pending ? "disabled" : true}
        title={saved ? `Edit ${saved.name}` : "New fault profile"}
        description={
          saved
            ? "Changes apply to the next call from each attached key."
            : "Pick the failure to inject and how often it fires."
        }
      />
      <FormField label="Name" error={form.formState.errors.name?.message}>
        <Input
          autoComplete="off"
          autoFocus={!profile}
          maxLength={PROFILE_NAME_MAX_LENGTH}
          placeholder="retry-storm"
          {...form.register("name")}
        />
      </FormField>
      <ScenarioPicker value={scenario} onChange={changeScenario} />
      <ScenarioParamsFields
        scenario={scenario}
        values={paramText}
        errors={paramErrors}
        onChange={(name, value) => {
          setParamText((current) => ({ ...current, [name]: value }));
          setParamErrors((current) => ({ ...current, [name]: "" }));
        }}
      />
      <ProbabilityField
        value={percent}
        error={form.formState.errors.percent?.message}
        onChange={(value) => {
          form.setValue("percent", value, { shouldDirty: true, shouldValidate: true });
        }}
      />
      <ProfileScheduleFields
        control={form.control}
        expiresAt={{
          ...expiresRegister,
          ref: (element: HTMLInputElement | null) => {
            expiresRegister.ref(element);
            setExpiresInput(element);
          },
        }}
        expiresAtError={form.formState.errors.expiresAt?.message}
      />
      <AttachKeysSection
        profileId={saved?.id ?? null}
        selected={keyIds}
        errors={keyErrors}
        onToggle={toggleKey}
      />
      <ProfileFooter profile={saved} saving={pending} pending={pending} onDeleted={onDone} />
    </form>
  );
}
