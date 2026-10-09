import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { errorPaths, routeFormSchema, type RouteFormValues } from "./route-form";

/**
 * The editor's form. Validated on every change, so the save bar can count the fields that need a
 * fix as the person types, the way the frame shows it.
 */
export function useRouteForm(initial: RouteFormValues) {
  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: initial,
    mode: "onChange",
  });
  return { form, errors: errorPaths(form.formState.errors) };
}
