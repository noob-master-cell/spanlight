import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { alertsApi, isApiError, queryKeys, type AlertRulePreviewInput } from "@/lib/api";

import { definitionIssues, toPreviewInput, type RuleFormValues } from "./rule-form-schema";
import { toPreviewSeries, type PreviewSeries } from "./preview-series";

/** Typing settles for this long before the preview asks the server again. */
export const PREVIEW_DEBOUNCE_MS = 500;
/** The same definition within a minute reuses the answer; the server allows 30 a minute. */
const PREVIEW_STALE_MS = 60_000;

export type RulePreviewState =
  /** The definition can't be previewed yet: a field is empty or out of range. */
  | { status: "blocked" }
  | { status: "loading" }
  /** `429 RATE_LIMITED`: more than 30 previews this minute. Not an error worth a retry button. */
  | { status: "paused" }
  | { status: "error"; retry: () => void }
  /** `refreshing` while a newer definition is on its way: the old chart stays, dimmed. */
  | { status: "ready"; series: PreviewSeries; refreshing: boolean };

/** `value` once it has stayed the same for `delay` ms; compared by its JSON text. */
function useSettled<T>(value: T, delay: number): { value: T; settled: boolean } {
  const text = JSON.stringify(value);
  const [settledText, setSettledText] = useState(text);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettledText(text);
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [text, delay]);
  return { value: JSON.parse(settledText) as T, settled: settledText === text };
}

function isRateLimited(error: unknown): boolean {
  return isApiError(error) && error.status === 429;
}

/**
 * The rule's last 7 days as the server would have measured them. Asks only while the definition
 * is valid, 500 ms after the last change; an edited rule's preview loads at once.
 */
export function useRulePreview(projectId: string, values: RuleFormValues): RulePreviewState {
  const valid = definitionIssues(values).length === 0;
  const input: AlertRulePreviewInput | null = valid ? toPreviewInput(values) : null;
  const settled = useSettled(input, PREVIEW_DEBOUNCE_MS);
  const body = settled.value;
  const keys = queryKeys.project(projectId);

  const query = useQuery({
    queryKey: body ? keys.alertPreview(body) : [...keys.all, "alert-preview", null],
    queryFn: body ? () => alertsApi.previewRule(projectId, body) : skipToken,
    select: toPreviewSeries,
    placeholderData: keepPreviousData,
    staleTime: PREVIEW_STALE_MS,
    refetchOnWindowFocus: false,
    retry: (failures, error) =>
      failures < 1 && !(isApiError(error) && error.status >= 400 && error.status < 500),
  });

  if (input === null) {
    return { status: "blocked" };
  }
  if (query.isError && !query.isFetching) {
    return isRateLimited(query.error)
      ? { status: "paused" }
      : {
          status: "error",
          retry: () => {
            void query.refetch();
          },
        };
  }
  if (query.data === undefined) {
    return { status: "loading" };
  }
  return {
    status: "ready",
    series: query.data,
    refreshing: !settled.settled || query.isFetching || query.isPlaceholderData,
  };
}
