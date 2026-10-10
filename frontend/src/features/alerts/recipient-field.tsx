import { ChipMultiSelect, type ChipOption } from "@/components/chip-multi-select";
import { FormField } from "@/components/form-field";
import { useCurrentOrg } from "@/features/shell";
import type { Member } from "@/lib/api";

import { MAX_RECIPIENTS } from "./channel-schema";
import { useOrgMembersQuery } from "./channels-queries";

interface RecipientFieldProps {
  value: string[];
  onChange: (value: string[]) => void;
  error: string | undefined;
  /** Addresses the server refused (`RECIPIENT_NOT_MEMBER`), drawn as error chips. */
  refused: readonly string[];
}

function initials(name: string, email: string): string {
  const words = (name.trim() || email).split(/[\s@._-]+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function memberOption(member: Member): ChipOption {
  const email = member.user.email.toLowerCase();
  return {
    value: email,
    label: member.user.name || email,
    detail: email,
    chip: email,
    leading: (
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-2xs font-semibold text-accent"
      >
        {initials(member.user.name, email)}
      </span>
    ),
    disabledNote: member.user.email_verified ? undefined : "Not verified",
  };
}

/**
 * Figma "email (recipient picker open)": recipients are picked from the org's members (§2.1);
 * members without a verified email are listed but can't be picked. A saved address that is no
 * longer a member still shows as a chip, in the error style once the server refuses it.
 */
export function RecipientField({ value, onChange, error, refused }: RecipientFieldProps) {
  const orgName = useCurrentOrg()?.name ?? "your organization";
  const members = useOrgMembersQuery();
  const known = (members.data ?? []).map(memberOption);
  const knownValues = new Set(known.map((option) => option.value));
  const unknown: ChipOption[] = value
    .filter((address) => !knownValues.has(address))
    .map((address) => ({ value: address, label: address, invalid: members.isSuccess }));
  const options = [...known, ...unknown].map((option) =>
    refused.includes(option.value) ? { ...option, invalid: true } : option,
  );
  const loadProblem = members.isError
    ? "Couldn't load the member list. Close and try again."
    : undefined;

  return (
    <FormField
      label="Recipients"
      hint={`Only verified members of ${orgName} can receive alert email.`}
      error={error ?? loadProblem}
    >
      <ChipMultiSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={members.isPending ? "Loading members…" : "Add a member"}
        label="Recipients"
        max={MAX_RECIPIENTS}
      />
    </FormField>
  );
}
