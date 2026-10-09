import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { errorMessage, isApiError, type Route } from "@/lib/api";

import { configFromFormValues, formValuesFromConfig, type RouteFormValues } from "./route-form";
import { applyRouteFieldErrors } from "./route-form-errors";
import { isRouteVersionConflict, useRouteQuery, useUpdateRoute } from "./routes-queries";

/**
 * Saving an existing route: `PUT` with the version the form was loaded from. A stale version
 * comes back as `409 ROUTE_VERSION_CONFLICT`; the editor then shows the newer version number and
 * blocks saving until "Reload latest" replaces the form with what is stored now.
 *
 * The base version is kept here, not read from the route query: a refetch while the form is dirty
 * (reconnect, a default-route change) brings a newer `route.version`, and sending that would let
 * edits made on the old version overwrite the new one without a conflict.
 */
export function useRouteSave(route: Route, form: UseFormReturn<RouteFormValues>) {
  const update = useUpdateRoute(route.id);
  const routeQuery = useRouteQuery(route.id);
  const [baseVersion, setBaseVersion] = useState(route.version);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [reloading, setReloading] = useState(false);

  const submit = form.handleSubmit((values) => {
    update.mutate(
      { config: configFromFormValues(values), expected_version: baseVersion },
      {
        onSuccess: (saved) => {
          form.reset(formValuesFromConfig(saved.config));
          setBaseVersion(saved.version);
          toast.success(`Saved version ${saved.version} of ${saved.name}.`);
        },
        onError: (error) => {
          if (isRouteVersionConflict(error)) {
            const current = isApiError(error) ? error.currentVersion : null;
            setConflictVersion(current ?? baseVersion + 1);
          } else if (!applyRouteFieldErrors(error, form.setError)) {
            toast.error(errorMessage(error));
          }
        },
      },
    );
  });

  async function reloadLatest() {
    setReloading(true);
    try {
      const result = await routeQuery.refetch({ throwOnError: true });
      if (result.data) {
        form.reset(formValuesFromConfig(result.data.config));
        setBaseVersion(result.data.version);
        setConflictVersion(null);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setReloading(false);
    }
  }

  /** After a revert (a new version saved from the history), the form shows the restored config. */
  function adopt(saved: Route) {
    form.reset(formValuesFromConfig(saved.config));
    setBaseVersion(saved.version);
    setConflictVersion(null);
  }

  /** Discard: the form goes back to the stored route as last fetched, and saves against it. */
  function discard() {
    form.reset(formValuesFromConfig(route.config));
    setBaseVersion(route.version);
  }

  return {
    submit,
    /** The version the form's content was loaded from. */
    baseVersion,
    saving: update.isPending,
    conflictVersion,
    reloadLatest,
    reloading,
    adopt,
    discard,
  };
}
