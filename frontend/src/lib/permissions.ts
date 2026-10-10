import type { Role } from "@/lib/api";

/** Mirrors backend `core/permissions.py`. The server is authoritative; this only drives UI. */
export type Permission =
  | "org:read"
  | "project:read"
  | "key:create"
  | "key:revoke_own"
  | "key:revoke_any"
  | "project:write"
  | "project:delete"
  | "member:manage"
  | "audit:read"
  | "org:update"
  | "org:delete"
  | "org:security"
  | "export:create"
  | "gateway:write"
  | "credentials:manage"
  | "alerts:write"
  | "insights:manage";

const VIEWER: Permission[] = ["org:read", "project:read"];
const MEMBER: Permission[] = [...VIEWER, "key:create", "key:revoke_own", "export:create"];
const ADMIN: Permission[] = [
  ...MEMBER,
  "key:revoke_any",
  "project:write",
  "project:delete",
  "member:manage",
  "org:update",
  "audit:read",
  "gateway:write",
  "alerts:write",
  "insights:manage",
];
const OWNER: Permission[] = [...ADMIN, "org:delete", "org:security", "credentials:manage"];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  viewer: new Set(VIEWER),
  member: new Set(MEMBER),
  admin: new Set(ADMIN),
  owner: new Set(OWNER),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) {
    return false;
  }
  return ROLE_PERMISSIONS[role].has(permission);
}

export const ROLES: Role[] = ["owner", "admin", "member", "viewer"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full access, including deleting the organization.",
  admin: "Manage projects, members, all API keys and the audit log.",
  member: "View data and create or revoke their own API keys.",
  viewer: "Read-only access to traces and metrics.",
};
