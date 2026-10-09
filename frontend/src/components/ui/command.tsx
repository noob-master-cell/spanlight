import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn("flex h-full w-full flex-col overflow-hidden bg-surface", className)}
      {...props}
    />
  );
}

interface CommandDialogProps extends ComponentProps<typeof Dialog> {
  title: string;
  description: string;
  children: ReactNode;
}

function CommandDialog({ title, description, children, ...props }: CommandDialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent
        hideClose
        className="top-[16vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <Command loop>{children}</Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-5">
      <Search className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
      <CommandPrimitive.Input
        className={cn(
          "flex h-14 w-full bg-transparent text-base outline-none placeholder:text-subtle-foreground",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn("max-h-96 scroll-py-2 overflow-x-hidden overflow-y-auto p-2", className)}
      {...props}
    />
  );
}

function CommandEmpty(props: ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      className="py-10 text-center text-sm text-muted-foreground"
      {...props}
    />
  );
}

function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        "overflow-hidden p-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-overline [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase",
        className,
      )}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex h-10 cursor-default items-center gap-3 rounded-md px-3 text-sm outline-none select-none",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-surface-muted",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    // Hidden from assistive technology: a separator is not a valid child of a listbox.
    <CommandPrimitive.Separator
      aria-hidden
      className={cn("-mx-2 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
};
