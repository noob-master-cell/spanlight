import { Lock } from "lucide-react";

import { FormField } from "@/components/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import type { FaultProfile } from "@/lib/api";

import { isProductionEnvironment } from "../environment";
import { FAULT_ON_PRODUCTION_REASON, detachToSaveMessage } from "./key-form";

/** Radix Select cannot hold an empty item value, so "None" travels under this one. */
const NONE = "none";

interface FaultProfileFieldProps {
  /** The environment as typed so far: production turns the selector off. */
  environment: string;
  /** The chosen profile id; empty means none. */
  value: string;
  onChange: (value: string) => void;
  profiles: FaultProfile[] | undefined;
  profilesFailed: boolean;
  /** The profile the key has now, to say when choosing another replaces it. */
  currentProfileId: string;
  error?: string | undefined;
}

/**
 * Figma "Edit key sheet": the one profile a key may run. On a production key the selector is
 * disabled, and the reason is written under it as well as in a tooltip, so touch and screen reader
 * users get it too.
 */
export function FaultProfileField({
  environment,
  value,
  onChange,
  profiles,
  profilesFailed,
  currentProfileId,
  error,
}: FaultProfileFieldProps) {
  const production = isProductionEnvironment(environment);
  // A production key that still has a profile may be changed once, to None. With none attached
  // the selector is locked.
  const locked = production && value === "";
  const detaching = production && value !== "";
  const current = profiles?.find((profile) => profile.id === currentProfileId);
  const chosen = profiles?.find((profile) => profile.id === value);
  const replacing =
    !production && currentProfileId !== "" && value !== "" && value !== currentProfileId;

  let hint = "A key runs one fault profile at a time. Pick None to detach it.";
  if (locked) {
    hint = FAULT_ON_PRODUCTION_REASON;
  } else if (detaching) {
    hint = detachToSaveMessage(chosen?.name ?? "the fault profile");
  } else if (profilesFailed) {
    hint = "Couldn't load fault profiles. Close this panel and try again.";
  } else if (replacing) {
    hint = `Replaces ${current?.name ?? "the current profile"} on this key.`;
  }

  return (
    <FormField label="Fault profile" hint={hint} error={error}>
      <FaultSelect
        locked={locked}
        value={value}
        onChange={onChange}
        profiles={detaching ? (chosen ? [chosen] : []) : profiles}
        disabled={locked || profiles === undefined}
      />
    </FormField>
  );
}

interface FaultSelectProps {
  locked: boolean;
  disabled: boolean;
  value: string;
  onChange: (value: string) => void;
  profiles: FaultProfile[] | undefined;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

function FaultSelect({
  locked,
  disabled,
  value,
  onChange,
  profiles,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: FaultSelectProps) {
  const select = (
    <Select
      value={value === "" ? NONE : value}
      onValueChange={(next) => {
        onChange(next === NONE ? "" : next);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="disabled:bg-surface-muted"
      >
        <SelectValue placeholder={profiles === undefined ? "Loading fault profiles…" : "None"} />
        {locked ? (
          <Lock aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground" />
        ) : null}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {profiles?.map((profile) => (
          <SelectItem key={profile.id} value={profile.id}>
            {profile.name}
            {profile.active ? "" : " (inactive)"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!locked) {
    return select;
  }
  // A disabled control takes no focus or hover, so the tooltip sits on a focusable wrapper.
  return (
    <Tooltip content={FAULT_ON_PRODUCTION_REASON}>
      <span
        tabIndex={0}
        role="group"
        aria-label="Fault profile"
        aria-describedby={ariaDescribedBy}
        className="block rounded-input"
      >
        {select}
      </span>
    </Tooltip>
  );
}
