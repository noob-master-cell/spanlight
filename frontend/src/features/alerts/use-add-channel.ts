import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";

import type { AlertChannel } from "@/lib/api";

import { MAX_RULE_CHANNELS, type RuleFormValues } from "./rule-form-schema";

/**
 * "Add channel" from inside the rule editor. The channel dialog is rendered next to the rule form
 * (never inside it, so its submit can't reach the rule form) and stays mounted while the channel
 * list refetches, so a webhook's one-time secret reveal survives the refetch. The channel created
 * there is picked for the rule straight away, up to the limit.
 */
export function useAddChannel(form: UseFormReturn<RuleFormValues>) {
  const [open, setOpen] = useState(false);

  return {
    open,
    onOpenChange: setOpen,
    start: () => {
      setOpen(true);
    },
    onCreated: (channel: AlertChannel) => {
      const picked = form.getValues("channelIds");
      if (picked.includes(channel.id) || picked.length >= MAX_RULE_CHANNELS) {
        return;
      }
      form.setValue("channelIds", [...picked, channel.id], {
        shouldDirty: true,
        shouldValidate: form.formState.isSubmitted,
      });
    },
  };
}
