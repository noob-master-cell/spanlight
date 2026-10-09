/**
 * What other features may use from `features/shell`: the signed-in frame's hooks (the current
 * project, organization and role) and the account frame. Import from this file, not from the
 * modules behind it.
 */
export { AccountShell } from "./account-shell";
export {
  useCurrentOrg,
  useCurrentRole,
  useOrgProjectsQuery,
  usePermission,
  useProjectParams,
  useProjectQuery,
} from "./project-context";
export { useSignOut } from "./use-sign-out";
