import type { ComponentProps, ReactNode } from "react";
import { FormProvider, type UseFormReturn } from "react-hook-form";

import type { Credential, GatewayKey } from "@/lib/api";

import { FallbackFields } from "./fallback-fields";
import { RetryPolicyFields } from "./retry-policy-fields";
import { RouteAside } from "./route-aside";
import type { RouteFormValues } from "./route-form";
import { TargetsField } from "./targets-field";
import { TimeoutField } from "./timeout-field";

export interface RouteEditorContext {
  credentials: readonly Credential[];
  /** Active keys on the route; null while unknown. */
  keys: readonly GatewayKey[] | null;
  /** Without `gateway:write` every control is disabled and there is no save bar. */
  canWrite: boolean;
}

interface RouteEditorFormProps {
  form: UseFormReturn<RouteFormValues>;
  onSubmit: ComponentProps<"form">["onSubmit"];
  context: RouteEditorContext;
  /** The save bar, inside the form so its button submits it. */
  footer: ReactNode;
}

/**
 * Figma "Gateway — Route editor" below the header: the Targets, Retry policy, Fallback and
 * Timeout cards, the side column, and the sticky save bar. Used for new and existing routes.
 */
export function RouteEditorForm({ form, onSubmit, context, footer }: RouteEditorFormProps) {
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <fieldset
            disabled={!context.canWrite}
            aria-label="Route settings"
            className="flex min-w-0 flex-col gap-4"
          >
            <TargetsField credentials={context.credentials} />
            <RetryPolicyFields />
            <FallbackFields />
            <TimeoutField />
          </fieldset>
          <RouteAside keys={context.keys} />
        </div>
        {footer}
      </form>
    </FormProvider>
  );
}
