/**
 * Human labels for audit actions. The backend records present-tense verbs
 * ("key.create"); past-tense aliases are accepted too so older or future
 * spellings still read well. Unknown actions fall back to the raw string.
 */
const AUDIT_ACTION_LABELS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    "org.create": "Created organization",
    "org.created": "Created organization",
    "org.update": "Updated organization",
    "org.updated": "Updated organization",
    "org.delete": "Deleted organization",
    "org.deleted": "Deleted organization",
    "project.create": "Created project",
    "project.created": "Created project",
    "project.update": "Updated project settings",
    "project.updated": "Updated project settings",
    "project.delete": "Deleted project",
    "project.deleted": "Deleted project",
    "key.create": "Created API key",
    "key.created": "Created API key",
    "key.revoke": "Revoked API key",
    "key.revoked": "Revoked API key",
    "member.add": "Added member",
    "member.added": "Added member",
    "member.role_change": "Changed member role",
    "member.role_changed": "Changed member role",
    "member.remove": "Removed member",
    "member.removed": "Removed member",
    "invite.create": "Created invite link",
    "invite.created": "Created invite link",
    "invite.accept": "Accepted invite",
    "invite.accepted": "Accepted invite",
    "invite.revoke": "Revoked invite link",
    "invite.revoked": "Revoked invite link",
    "session.revoke": "Revoked a session",
    "session.revoked": "Revoked a session",
    "user.login": "Signed in",
    "user.logout": "Signed out",
    "user.signup": "Created account",
    "user.password_reset": "Reset password",
  }),
);

/** The label for a known action, or null so the caller can show the raw action in mono. */
export function auditActionLabel(action: string): string | null {
  return AUDIT_ACTION_LABELS.get(action) ?? null;
}

const TARGET_TYPE_LABELS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    org: "Organization",
    organization: "Organization",
    project: "Project",
    api_key: "API key",
    key: "API key",
    user: "User",
    member: "Member",
    invite: "Invite",
    session: "Session",
  }),
);

export function targetTypeLabel(targetType: string): string {
  return TARGET_TYPE_LABELS.get(targetType) ?? targetType;
}

const SHORT_ID_LENGTH = 8;

/**
 * Eight characters to tell targets apart on screen. Target IDs are UUIDv7, whose leading
 * characters are a timestamp shared by everything created in the same minute, so the short
 * form is taken from the random tail instead. The full ID is shown on hover.
 */
export function shortTargetId(targetId: string): string {
  const compact = targetId.replaceAll("-", "");
  return compact.length > SHORT_ID_LENGTH ? compact.slice(-SHORT_ID_LENGTH) : targetId;
}

function readString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * A one-line summary of the event's metadata for the table, e.g. the key name
 * or "member → admin". Null when there's nothing worth surfacing.
 */
export function auditEventSummary(
  action: string,
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata) {
    return null;
  }
  const from = readString(metadata, "from");
  const to = readString(metadata, "to");
  if (from && to) {
    return `${from} → ${to}`;
  }
  const changes = metadata.changes;
  if (action.startsWith("project.") && changes && typeof changes === "object") {
    const fields = Object.keys(changes);
    return fields.length > 0 ? fields.join(", ") : null;
  }
  return readString(metadata, "name") ?? readString(metadata, "role");
}

export function hasMetadata(metadata: Record<string, unknown> | null): boolean {
  return metadata !== null && Object.keys(metadata).length > 0;
}
