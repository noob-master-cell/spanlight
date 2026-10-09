import { Link2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/copy-button";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CreatedInvite, Role } from "@/lib/api";
import { formatTimestamp } from "@/lib/format";
import { ROLE_LABELS, ROLES } from "@/lib/permissions";

import { useCreateInvite } from "./member-queries";
import { inviteExpiryLabel, isRole, roleHint, roleWithArticle } from "./member-utils";

const DEFAULT_INVITE_ROLE: Role = "member";

export function InviteSection() {
  const roleId = useId();
  const roleHintId = useId();
  const [role, setRole] = useState<Role>(DEFAULT_INVITE_ROLE);
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const createInvite = useCreateInvite();

  function handleCreate() {
    createInvite.mutate(role, {
      onSuccess: (created) => {
        setInvite(created);
        createInvite.reset();
        toast.success(`Invite link created for ${roleWithArticle(created.role)}.`);
      },
    });
  }

  return (
    <SectionCard
      title="Invite people"
      description="Create a single-use link and share it with the person you want to add."
      className="gap-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2 sm:w-[220px]">
          <Label htmlFor={roleId} className="text-sm">
            Role
          </Label>
          <Select
            value={role}
            onValueChange={(next) => {
              if (isRole(next)) {
                setRole(next);
              }
            }}
          >
            <SelectTrigger id={roleId} aria-describedby={roleHintId} className="h-12 pr-3.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((option) => (
                <SelectItem key={option} value={option}>
                  {ROLE_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="primary" size="lg" loading={createInvite.isPending} onClick={handleCreate}>
          Create invite link
        </Button>
      </div>
      <p id={roleHintId} className="text-xs font-medium text-muted-foreground">
        {roleHint(role)}
      </p>

      {invite ? <CreatedInviteLink invite={invite} /> : null}
    </SectionCard>
  );
}

function CreatedInviteLink({ invite }: { invite: CreatedInvite }) {
  const linkId = useId();

  return (
    <div className="flex flex-col gap-2.5 rounded-tile bg-surface-muted p-4">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={linkId} className="flex items-center gap-1.5 text-sm">
          <Link2 aria-hidden className="size-3.5" />
          Invite link
        </Label>
        <span
          className="text-xs font-medium text-muted-foreground"
          title={formatTimestamp(invite.expires_at) ?? undefined}
        >
          {inviteExpiryLabel(invite.expires_at)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={linkId}
          readOnly
          value={invite.url}
          className="h-11 flex-1 border-border px-3.5 font-mono text-label"
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <CopyButton
          value={invite.url}
          label="Copy"
          aria-label="Copy invite link"
          showLabel
          variant="secondary"
          className="h-11 px-4 text-sm shadow-none [&_svg]:size-3.5"
        />
      </div>
      <p className="text-xs font-medium text-muted-foreground">
        Anyone with this link can join as {roleWithArticle(invite.role)}. It works once.
      </p>
    </div>
  );
}
