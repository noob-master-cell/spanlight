import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, type ReactElement } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { DialogHeading } from "@/components/dialog-heading";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { errorMessage, type GatewayKey } from "@/lib/api";
import { formatDate } from "@/lib/format";

import { useFaultProfilesQuery, useGatewayRoutesQuery } from "../gateway-queries";
import { RevokeKeyAction, REVOKE_BODY } from "./revoke-key-action";
import { FaultProfileField } from "./fault-profile-field";
import { KeyFields } from "./key-fields";
import { applyKeyProblem } from "./key-form-errors";
import {
  detachToSaveMessage,
  faultProductionConflict,
  formValuesFromKey,
  keyFormSchema,
  toUpdateInput,
  type KeyFormValues,
} from "./key-form";
import { useUpdateGatewayKey } from "./keys-queries";
import { useDraftProblems } from "./use-draft-problems";

interface EditKeySheetProps {
  gatewayKey: GatewayKey;
  /** The element that opens the sheet: the row's Edit button. */
  trigger: ReactElement;
}

/** Figma "Edit key sheet": a right-hand panel with every setting, the fault profile and Revoke. */
export function EditKeySheet({ gatewayKey, trigger }: EditKeySheetProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next || !pending) {
          setOpen(next);
        }
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      {open ? (
        <SheetContent side="right" hideClose className="w-[520px] gap-0 p-6 sm:p-7">
          <EditKeyForm
            gatewayKey={gatewayKey}
            onPendingChange={setPending}
            onDone={() => {
              setOpen(false);
            }}
          />
        </SheetContent>
      ) : null}
    </Sheet>
  );
}

interface EditKeyFormProps {
  gatewayKey: GatewayKey;
  onPendingChange: (pending: boolean) => void;
  onDone: () => void;
}

function EditKeyForm({ gatewayKey, onPendingChange, onDone }: EditKeyFormProps) {
  const routesQuery = useGatewayRoutesQuery();
  const profilesQuery = useFaultProfilesQuery();
  const update = useUpdateGatewayKey();
  const pending = update.isPending;

  useEffect(() => {
    onPendingChange(pending);
    return () => {
      onPendingChange(false);
    };
  }, [pending, onPendingChange]);

  const drafts = useDraftProblems();
  const form = useForm<KeyFormValues>({
    resolver: zodResolver(keyFormSchema),
    defaultValues: formValuesFromKey(gatewayKey),
  });
  const environment = useWatch({ control: form.control, name: "environment" });

  const onSubmit = form.handleSubmit(async (values) => {
    if (drafts.blockSave(form.setError)) {
      return;
    }
    if (faultProductionConflict(values)) {
      const name = profilesQuery.data?.find(
        (profile) => profile.id === values.faultProfileId,
      )?.name;
      form.setError("faultProfileId", {
        type: "validate",
        message: detachToSaveMessage(name ?? "the fault profile"),
      });
      return;
    }
    const changes = toUpdateInput(values, gatewayKey);
    if (Object.keys(changes).length === 0) {
      onDone();
      return;
    }
    try {
      await update.mutateAsync({ keyId: gatewayKey.id, update: changes });
      toast.success(`Saved gateway key "${values.name}".`);
      onDone();
    } catch (error) {
      if (!applyKeyProblem(error, form.setError)) {
        toast.error(errorMessage(error));
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-[22px]">
      <DialogHeading
        overline="Gateway key"
        title={gatewayKey.name}
        showClose={pending ? "disabled" : true}
        description={<KeyMeta gatewayKey={gatewayKey} />}
      />
      <KeyFields
        form={form}
        routes={routesQuery.data}
        routesFailed={routesQuery.isError}
        onRetryRoutes={() => {
          void routesQuery.refetch();
        }}
        reportDraft={drafts.report}
        layout="sheet"
        currentCacheTtl={gatewayKey.cache_ttl_seconds}
      />
      <Controller
        control={form.control}
        name="faultProfileId"
        render={({ field }) => (
          <FaultProfileField
            environment={environment}
            value={field.value}
            onChange={field.onChange}
            profiles={profilesQuery.data}
            profilesFailed={profilesQuery.isError}
            currentProfileId={gatewayKey.fault_profile_id ?? ""}
            error={form.formState.errors.faultProfileId?.message}
          />
        )}
      />
      <DangerZone gatewayKey={gatewayKey} onRevoked={onDone} />
      <div className="flex justify-end gap-2.5 max-sm:[&>*]:flex-1">
        <SheetClose asChild>
          <Button type="button" disabled={pending}>
            Cancel
          </Button>
        </SheetClose>
        <Button type="submit" variant="primary" loading={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

/** "spl_gw_k3v6q2m7x4ab… · created Sep 12, 2026 by Dheeraj · last used 2 min ago". */
function KeyMeta({ gatewayKey }: { gatewayKey: GatewayKey }) {
  const creator = gatewayKey.created_by;
  return (
    <>
      <span className="font-mono text-label">{gatewayKey.prefix}…</span> · created{" "}
      {formatDate(gatewayKey.created_at)}
      {creator ? ` by ${creator.name || creator.email}` : ""} · last used{" "}
      {gatewayKey.last_used_at ? <RelativeTime iso={gatewayKey.last_used_at} /> : "never"}
    </>
  );
}

function DangerZone({ gatewayKey, onRevoked }: { gatewayKey: GatewayKey; onRevoked: () => void }) {
  return (
    <section aria-label="Danger zone" className="grid gap-3 rounded-tile border border-danger p-5">
      <h3 className="text-base font-bold text-danger-text">Danger zone</h3>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="text-sm font-semibold text-foreground">Revoke key</p>
          <p className="text-sm text-muted-foreground">{REVOKE_BODY}</p>
        </div>
        <RevokeKeyAction gatewayKey={gatewayKey} variant="danger-zone" onRevoked={onRevoked} />
      </div>
    </section>
  );
}
