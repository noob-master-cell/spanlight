import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import {
  alertsApi,
  errorMessage,
  isApiError,
  queryKeys,
  type AlertRule,
  type AlertRuleInput,
} from "@/lib/api";
import { applyMappedFieldErrors } from "@/lib/form-errors";

import { ruleFieldOf, toRuleInput, type RuleFormValues } from "./rule-form-schema";

const UNKNOWN_CHANNEL_PREFIX = "Not a channel here: ";
const UNKNOWN_CHANNEL_MESSAGE = "Remove the channels that no longer exist to save this rule.";

/** The ids in the server's "Not a channel here: <id>, <id>" message on `channel_ids`. */
function unknownChannelIds(error: unknown): string[] {
  if (!isApiError(error)) {
    return [];
  }
  const message = error.fieldErrors.find((field) => field.field.startsWith("channel_ids"))?.message;
  if (!message?.startsWith(UNKNOWN_CHANNEL_PREFIX)) {
    return [];
  }
  return message.slice(UNKNOWN_CHANNEL_PREFIX.length).split(", ").filter(Boolean);
}

/**
 * Creates or replaces a rule (an edit sends the whole rule) and maps each refusal to where the
 * frames show it: field errors on their fields, `UNKNOWN_CHANNEL` on Channels with the refused
 * chips in red, `LIMIT_EXCEEDED` and anything else in the banner above the form. On success the
 * rules list and the rule's detail refetch.
 */
export function useRuleSubmit(
  form: UseFormReturn<RuleFormValues>,
  projectId: string,
  rule: AlertRule | undefined,
  onSaved: () => void,
) {
  const queryClient = useQueryClient();
  const keys = queryKeys.project(projectId);
  const [problem, setProblem] = useState<string | null>(null);
  const [refused, setRefused] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: (input: AlertRuleInput) =>
      rule
        ? alertsApi.updateRule(projectId, rule.id, input)
        : alertsApi.createRule(projectId, input),
    onSuccess: async (saved) => {
      queryClient.setQueryData(keys.alertRule(saved.id), saved);
      // The list key is the prefix of every rule's key, so this refetches the detail too.
      // A changed definition closes the rule's open event on the server, so the timeline refetches.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.alertRules }),
        queryClient.invalidateQueries({ queryKey: keys.alertEventsAll }),
      ]);
    },
  });

  function handleError(error: unknown) {
    const code = isApiError(error) ? error.code : null;
    if (code === "UNKNOWN_CHANNEL") {
      setRefused(unknownChannelIds(error));
      form.setError("channelIds", { type: "server", message: UNKNOWN_CHANNEL_MESSAGE });
    } else if (code === "LIMIT_EXCEEDED") {
      setProblem(errorMessage(error));
    } else if (!applyMappedFieldErrors(error, form.setError, ruleFieldOf)) {
      setProblem(errorMessage(error));
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setProblem(null);
    setRefused([]);
    try {
      const saved = await mutation.mutateAsync(toRuleInput(values));
      toast.success(rule ? `Saved "${saved.name}".` : `Created "${saved.name}".`);
      onSaved();
    } catch (error) {
      handleError(error);
    }
  });

  return {
    onSubmit,
    pending: mutation.isPending,
    /** A refusal that belongs to the whole form, shown above it. */
    problem,
    /** Channel ids the server refused, drawn as error chips until the next save. */
    refused,
  };
}
