import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";

import { DialogHeading } from "@/components/dialog-heading";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useProjectQuery } from "@/features/shell";

import { ROUTE_NAME_MAX_LENGTH, routeNameSchema } from "./route-form";

interface NewRouteDialogProps {
  trigger: ReactElement;
  /** Names already used in the project, so a taken name is caught before the editor opens. */
  takenNames: readonly string[];
  onContinue: (name: string) => void;
}

/**
 * Figma "New route": the name first, because it is fixed once the route exists. Continue opens
 * the editor on an unsaved route; nothing is created until "Create route" there.
 */
export function NewRouteDialog({ trigger, takenNames, onContinue }: NewRouteDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {open ? (
        <NewRouteForm
          takenNames={takenNames}
          onContinue={(name) => {
            setOpen(false);
            onContinue(name);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function NewRouteForm({
  takenNames,
  onContinue,
}: {
  takenNames: readonly string[];
  onContinue: (name: string) => void;
}) {
  const project = useProjectQuery();
  const form = useForm<{ name: string }>({
    resolver: zodResolver(routeNameSchema),
    defaultValues: { name: "" },
  });
  const projectName = project.data?.name ?? "this project";

  const submit = form.handleSubmit(({ name }) => {
    const trimmed = name.trim();
    if (takenNames.includes(trimmed)) {
      form.setError("name", {
        type: "taken",
        message: `A route named ${trimmed} already exists. Pick another name.`,
      });
      return;
    }
    onContinue(trimmed);
  });

  return (
    <DialogContent hideClose className="max-w-[440px] gap-5 rounded-card p-6 sm:p-7">
      <DialogHeading
        title="New route"
        description="Name the route, then set its targets. The name can't be changed later."
      />
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormField
          label="Name"
          hint={`Up to ${ROUTE_NAME_MAX_LENGTH} characters. Unique in ${projectName}.`}
          error={form.formState.errors.name?.message}
        >
          <Input
            autoComplete="off"
            autoFocus
            maxLength={ROUTE_NAME_MAX_LENGTH}
            placeholder="eval-sonnet"
            {...form.register("name")}
          />
        </FormField>
        <DialogFooter className="flex-row justify-end gap-2.5">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" variant="primary">
            Continue
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
