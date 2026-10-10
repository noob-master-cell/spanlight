import { Controller, useWatch, type UseFormReturn } from "react-hook-form";

import { Callout } from "@/components/callout";
import { ChipMultiSelect } from "@/components/chip-multi-select";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useAlertChannelsQuery } from "./alerts-queries";
import { channelOptions } from "./channel-options";
import { RULE_EDITOR_COPY } from "./rule-form-options";
import { MAX_RULE_CHANNELS, type RuleFormValues } from "./rule-form-schema";

interface ChannelMultiSelectProps {
  form: UseFormReturn<RuleFormValues>;
  /** Ids the server refused on the last save. */
  refused: readonly string[];
  /** Opens the channel dialog, which the editor renders outside its form. */
  onAddChannel: () => void;
}

/**
 * Figma "Channels field": the shared chip picker over the org's channels (removable chips, up to
 * 10). With no channel yet, the frame's hint offers to add one without leaving the editor.
 */
export function ChannelMultiSelect({ form, refused, onAddChannel }: ChannelMultiSelectProps) {
  const query = useAlertChannelsQuery();
  const picked = useWatch({ control: form.control, name: "channelIds" });
  const channels = query.data ?? [];
  const none = query.isSuccess && channels.length === 0 && picked.length === 0;

  if (query.isPending || none) {
    return (
      <div className="flex flex-col gap-2">
        <FormField label="Channels">
          <Input
            disabled
            placeholder={none ? RULE_EDITOR_COPY.noChannelsPlaceholder : "Loading channels…"}
          />
        </FormField>
        {none ? (
          <Callout
            action={
              <Button size="sm" onClick={onAddChannel}>
                Add channel
              </Button>
            }
          >
            {RULE_EDITOR_COPY.noChannelsHint}
          </Callout>
        ) : null}
      </div>
    );
  }

  const loadError = query.isError
    ? "Couldn't load channels. Check your connection and try again."
    : undefined;
  return (
    <Controller
      control={form.control}
      name="channelIds"
      render={({ field, fieldState }) => (
        <div
          ref={(element) => {
            // React Hook Form focuses the first refused field: here, the picker's text box.
            field.ref(element ? { focus: () => element.querySelector("input")?.focus() } : null);
          }}
        >
          <FormField
            label="Channels"
            hint={RULE_EDITOR_COPY.channelsHint}
            error={fieldState.error?.message ?? loadError}
            labelAction={
              query.isError ? (
                <button
                  type="button"
                  onClick={() => void query.refetch()}
                  className="rounded-sm text-xs font-semibold text-accent underline-offset-4 hover:underline"
                >
                  Try again
                </button>
              ) : null
            }
          >
            <ChipMultiSelect
              value={field.value}
              onChange={field.onChange}
              options={channelOptions(channels, field.value, refused)}
              placeholder={RULE_EDITOR_COPY.channelsPlaceholder}
              label="Channels"
              max={MAX_RULE_CHANNELS}
            />
          </FormField>
        </div>
      )}
    />
  );
}
