import { Ellipsis } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AlertChannel } from "@/lib/api";

import { ChannelDialog } from "./channel-dialog";
import { DeleteChannelDialog } from "./delete-channel-dialog";
import { RotateSecretDialog } from "./rotate-secret-dialog";

interface ChannelRowMenuProps {
  channel: AlertChannel;
  canWrite: boolean;
  readOnlyId: string;
}

type OpenDialog = "edit" | "rotate" | "delete" | null;

/**
 * Figma "Alerts — Channels — row menu": Edit, Rotate signing secret (webhooks only) and Delete.
 * Every item changes the channel, so the menu is disabled, with the page's reason, for people
 * without `alerts:write`.
 */
export function ChannelRowMenu({ channel, canWrite, readOnlyId }: ChannelRowMenuProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null);

  function openChange(which: Exclude<OpenDialog, null>) {
    return (open: boolean) => {
      setDialog(open ? which : null);
    };
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon-sm"
            disabled={!canWrite}
            aria-label={`More actions for ${channel.name}`}
            aria-describedby={canWrite ? undefined : readOnlyId}
            className="border-border-strong shadow-none"
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>Edit</DropdownMenuItem>
          {channel.kind === "webhook" ? (
            <DropdownMenuItem onSelect={() => setDialog("rotate")}>
              Rotate signing secret
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem destructive onSelect={() => setDialog("delete")}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChannelDialog channel={channel} open={dialog === "edit"} onOpenChange={openChange("edit")} />
      {channel.kind === "webhook" ? (
        <RotateSecretDialog
          channel={channel}
          open={dialog === "rotate"}
          onOpenChange={openChange("rotate")}
        />
      ) : null}
      <DeleteChannelDialog
        channel={channel}
        open={dialog === "delete"}
        onOpenChange={openChange("delete")}
      />
    </>
  );
}
