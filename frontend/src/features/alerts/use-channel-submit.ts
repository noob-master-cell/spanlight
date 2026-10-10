import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import {
  errorMessage,
  isApiError,
  type AlertChannel,
  type AlertChannelWithSecret,
} from "@/lib/api";
import { applyMappedFieldErrors } from "@/lib/form-errors";

import {
  channelFieldOf,
  toChannelCreate,
  toChannelUpdate,
  type ChannelFormValues,
} from "./channel-schema";
import { useCreateChannel, useUpdateChannel } from "./channels-queries";

/** A save the server refused for a reason that belongs to the whole form, not one field. */
export interface FormProblem {
  /** `not-configured`: the frame's "Encrypted storage isn't set up" notice (or the email one). */
  kind: "not-configured" | "other";
  message: string;
  /** The channel type that was being saved. */
  forKind: ChannelFormValues["kind"];
}

const NOT_MEMBER_PREFIX = "Not a verified member: ";

/** "dana@gmail.com" from the server's "Not a verified member: dana@gmail.com" field message. */
function nonMembersIn(error: unknown): string[] {
  if (!isApiError(error)) {
    return [];
  }
  const message = error.fieldErrors.find((field) => field.field.startsWith("config.to"))?.message;
  if (!message?.startsWith(NOT_MEMBER_PREFIX)) {
    return [];
  }
  return message.slice(NOT_MEMBER_PREFIX.length).split(", ").filter(Boolean);
}

function notMemberMessage(addresses: readonly string[], orgName: string): string {
  if (addresses.length === 1) {
    return `${addresses[0]} isn't a verified member of ${orgName}.`;
  }
  return `${addresses.join(", ")} aren't verified members of ${orgName}.`;
}

/**
 * Saves the channel form and maps every refusal to where the frames show it:
 * `CHANNEL_NAME_TAKEN` on Name, `RECIPIENT_NOT_MEMBER` on Recipients (refused chips turn red),
 * `UNSAFE_URL` on the endpoint URL, `NOT_CONFIGURED` and `LIMIT_EXCEEDED` above the form. A typed
 * secret stays in the (masked) field after a refusal the person can fix, so it need not be pasted
 * again; the form unmounts with the dialog, which drops it.
 */
export function useChannelSubmit(
  form: UseFormReturn<ChannelFormValues>,
  channel: AlertChannel | null,
  orgName: string,
  onSaved: (saved: AlertChannelWithSecret) => void,
) {
  const createChannel = useCreateChannel();
  const updateChannel = useUpdateChannel();
  const [problem, setProblem] = useState<FormProblem | null>(null);
  const [refused, setRefused] = useState<string[]>([]);

  function handleError(error: unknown, kind: ChannelFormValues["kind"]) {
    const code = isApiError(error) ? error.code : null;
    if (code === "NOT_CONFIGURED") {
      // Nothing can be stored until the server is set up: drop the typed secret.
      form.resetField("slackUrl");
      form.resetField("routingKey");
      setProblem({ kind: "not-configured", message: errorMessage(error), forKind: kind });
    } else if (code === "CHANNEL_NAME_TAKEN") {
      form.setError("name", { type: "server", message: errorMessage(error) });
    } else if (code === "RECIPIENT_NOT_MEMBER") {
      const addresses = nonMembersIn(error);
      setRefused(addresses);
      const message =
        addresses.length > 0 ? notMemberMessage(addresses, orgName) : errorMessage(error);
      form.setError("recipients", { type: "server", message });
    } else if (code === "LIMIT_EXCEEDED") {
      setProblem({ kind: "other", message: errorMessage(error), forKind: kind });
    } else if (
      !applyMappedFieldErrors(error, form.setError, (path) => channelFieldOf(path, kind))
    ) {
      toast.error(errorMessage(error));
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setProblem(null);
    setRefused([]);
    if (channel === null) {
      const result = await createChannel.run(toChannelCreate(values));
      if (!result.ok) {
        handleError(result.error, values.kind);
        return;
      }
      toast.success(`Added channel "${result.value.name}".`);
      onSaved(result.value);
      return;
    }
    const update = toChannelUpdate(values, channel);
    if (Object.keys(update).length === 0) {
      onSaved({ ...channel, secret: null });
      return;
    }
    const result = await updateChannel.run(channel.id, update);
    if (!result.ok) {
      handleError(result.error, values.kind);
      return;
    }
    toast.success(`Saved channel "${result.value.name}".`);
    onSaved(result.value);
  });

  return {
    onSubmit,
    pending: createChannel.pending || updateChannel.pending,
    problem,
    /** Addresses the server refused, drawn as error chips until the next save. */
    refused,
  };
}
