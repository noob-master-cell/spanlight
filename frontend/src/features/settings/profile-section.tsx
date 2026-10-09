import { useMe } from "@/features/auth/queries";
import { formatDate } from "@/lib/format";

import { InitialAvatar } from "./initial-avatar";
import { SettingsSection } from "./settings-section";

export function ProfileSection() {
  const { user } = useMe();
  const name = user.name || user.email;

  return (
    <SettingsSection
      title="Profile"
      description="How you appear to other members of your organizations."
    >
      <div className="flex items-center gap-3.5 sm:gap-[18px]">
        <InitialAvatar name={name} seed={user.id} size="lg" />
        <dl className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <dt className="sr-only">Name</dt>
          <dd className="truncate text-card text-foreground">{user.name || "No name set"}</dd>
          <dt className="sr-only">Email</dt>
          <dd className="text-sm [overflow-wrap:anywhere] text-muted-foreground">{user.email}</dd>
          <dt className="sr-only">Member since</dt>
          <dd className="text-xs font-medium text-subtle-foreground">
            Member since <time dateTime={user.created_at}>{formatDate(user.created_at)}</time>
          </dd>
        </dl>
      </div>
    </SettingsSection>
  );
}
