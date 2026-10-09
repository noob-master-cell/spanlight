import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { DialogHeading } from "@/components/dialog-heading";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { errorMessage, type CreatedGatewayKey } from "@/lib/api";

import { useGatewayRoutesQuery } from "../gateway-queries";
import { KeyFields } from "./key-fields";
import { applyKeyProblem } from "./key-form-errors";
import { EMPTY_KEY_FORM, keyFormSchema, toCreateInput, type KeyFormValues } from "./key-form";
import { useCreateGatewayKey } from "./keys-queries";
import { useDraftProblems } from "./use-draft-problems";

interface CreateKeyFormProps {
  /** Called as the request starts and ends, so the dialog can refuse to close in between. */
  onPendingChange: (pending: boolean) => void;
  /** Hands over the created key, secret included. The caller keeps it in state only. */
  onCreated: (key: CreatedGatewayKey, routeName: string | null) => void;
}

/** Figma "Create key dialog": name, environment, route, limits, allowed models, tags and cache. */
export function CreateKeyForm({ onCreated, onPendingChange }: CreateKeyFormProps) {
  const createKey = useCreateGatewayKey();
  const routesQuery = useGatewayRoutesQuery();
  const routes = routesQuery.data;
  const pending = createKey.pending;

  // A request that outlives the dialog would make a credential nobody sees.
  useEffect(() => {
    onPendingChange(pending);
    return () => {
      onPendingChange(false);
    };
  }, [pending, onPendingChange]);

  const drafts = useDraftProblems();
  const form = useForm<KeyFormValues>({
    resolver: zodResolver(keyFormSchema),
    defaultValues: { ...EMPTY_KEY_FORM, environment: "development" },
  });

  // Start on the project's default route, once the routes are in and nothing was picked yet.
  const defaultRouteId = routes?.find((route) => route.is_default)?.id;
  useEffect(() => {
    if (defaultRouteId && form.getValues("routeId") === "") {
      form.setValue("routeId", defaultRouteId);
    }
  }, [defaultRouteId, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (drafts.blockSave(form.setError)) {
      return;
    }
    const result = await createKey.run(toCreateInput(values));
    if (result.ok) {
      const routeName = routes?.find((route) => route.id === result.value.route_id)?.name ?? null;
      onCreated(result.value, routeName);
      toast.success(`Created gateway key "${result.value.name}".`);
    } else if (!applyKeyProblem(result.error, form.setError)) {
      toast.error(errorMessage(result.error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-[22px]">
      <DialogHeading
        showClose={pending ? "disabled" : true}
        title="Create gateway key"
        description="A gateway key routes calls through Spanlight and sets limits for one app or environment."
      />
      <KeyFields
        form={form}
        routes={routes}
        routesFailed={routesQuery.isError}
        onRetryRoutes={() => {
          void routesQuery.refetch();
        }}
        reportDraft={drafts.report}
        layout="dialog"
        currentCacheTtl={null}
      />
      <DialogFooter className="flex-row justify-end gap-2.5 max-sm:[&>*]:flex-1">
        <DialogClose asChild>
          <Button disabled={pending}>Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={pending} disabled={routes?.length === 0}>
          Create key
        </Button>
      </DialogFooter>
    </form>
  );
}
