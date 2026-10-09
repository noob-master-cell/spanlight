import { Link } from "@tanstack/react-router";

import { FormField } from "@/components/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectParams } from "@/features/shell";
import type { Route } from "@/lib/api";

interface RouteFieldProps {
  value: string;
  onChange: (value: string) => void;
  routes: Route[] | undefined;
  routesFailed: boolean;
  onRetry: () => void;
  error: string | undefined;
}

/** A project with no route cannot make a key: say so, and link to where a route is made. */
export function RouteField({
  value,
  onChange,
  routes,
  routesFailed,
  onRetry,
  error,
}: RouteFieldProps) {
  const { orgId, projectId } = useProjectParams();
  const none = routes?.length === 0;
  const message =
    error ??
    (none
      ? "Create a route first."
      : routesFailed
        ? "Couldn't load routes. Check your connection and try again."
        : undefined);

  return (
    <FormField
      label="Route"
      hint="Calls follow this route's targets and retries."
      error={message}
      labelAction={
        none ? (
          <Link
            to="/$orgId/$projectId/gateway/routes"
            params={{ orgId, projectId }}
            className="rounded-sm text-xs font-semibold text-accent underline-offset-4 hover:underline"
          >
            Go to Routes →
          </Link>
        ) : routesFailed ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-sm text-xs font-semibold text-accent underline-offset-4 hover:underline"
          >
            Try again
          </button>
        ) : null
      }
    >
      <RouteSelect value={value} onChange={onChange} routes={routes} failed={routesFailed} />
    </FormField>
  );
}

interface RouteSelectProps {
  value: string;
  onChange: (value: string) => void;
  routes: Route[] | undefined;
  failed: boolean;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

function RouteSelect({
  value,
  onChange,
  routes,
  failed,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: RouteSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={routes === undefined || routes.length === 0}
    >
      <SelectTrigger
        id={id}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="aria-invalid:border-[1.5px] aria-invalid:border-danger"
      >
        <SelectValue
          placeholder={
            failed
              ? "Routes unavailable"
              : routes === undefined
                ? "Loading routes…"
                : "Choose a route"
          }
        />
      </SelectTrigger>
      <SelectContent>
        {routes?.map((route) => (
          <SelectItem key={route.id} value={route.id}>
            {route.name}
            {route.is_default ? " (default)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
