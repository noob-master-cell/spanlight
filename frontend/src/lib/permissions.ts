import type { Role } from "@/lib/api";

/** Mirrors backend `core/permissions.py`. The server is authoritative; this only drives UI. */
export type Permission =
  | "project:read"
  | "key:create"
  | "key:revoke_own"
  | "key:revoke_any"
  | "project:write"
  | "member:manage"
  | "audit:read"
  | "org:delete";

const VIEWER: Permission[] = ["project:read"];
const MEMBER: Permission[] = [...VIEWER, "key:create", "key:revoke_own"];
const ADMIN: Permission[] = [
  ...MEMBER,
  "key:revoke_any",
  "project:write",
  "member:manage",
  "audit:read",
];
const OWNER: Permission[] = [...ADMIN, "org:delete"];

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
