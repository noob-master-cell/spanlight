import { useCallback, useState } from "react";

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Runs a request whose answer must stay out of the TanStack Query cache. A mutation keeps its
 * variables and its result in the mutation cache for a while; a setup secret, a code the person
 * typed and a set of recovery codes must live in component state and nowhere else, so these calls
 * go through here instead. The caller reads `ok` and keeps whatever it needs in its own state.
 */
export function useUncachedAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
) {
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (...args: Args): Promise<ActionResult<Result>> => {
      setPending(true);
      try {
        return { ok: true, value: await action(...args) };
      } catch (error) {
        return { ok: false, error };
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending };
}
