import { API_PREFIX, api } from "./client";
import type {
  AuditEvent,
  CreatedInvite,
  PendingInvite,
  Member,
  Org,
  OrgWithRole,
  Page,
  Project,
  Role,
} from "./types";

function orgPath(orgId: string): string {
  return `${API_PREFIX}/orgs/${encodeURIComponent(orgId)}`;
}

export const orgsApi = {
  create: (name: string): Promise<Org> => api.post<Org>(`${API_PREFIX}/orgs`, { name }),
  get: (orgId: string): Promise<OrgWithRole> => api.get<OrgWithRole>(orgPath(orgId)),

  projects: (orgId: string): Promise<Project[]> => api.get<Project[]>(`${orgPath(orgId)}/projects`),
  createProject: (orgId: string, name: string): Promise<Project> =>
    api.post<Project>(`${orgPath(orgId)}/projects`, { name }),

  members: (orgId: string): Promise<Member[]> => api.get<Member[]>(`${orgPath(orgId)}/members`),
  updateMemberRole: (orgId: string, userId: string, role: Role): Promise<Member> =>
    api.patch<Member>(`${orgPath(orgId)}/members/${encodeURIComponent(userId)}`, { role }),
  removeMember: (orgId: string, userId: string): Promise<void> =>
    api.delete(`${orgPath(orgId)}/members/${encodeURIComponent(userId)}`),

  invites: (orgId: string): Promise<PendingInvite[]> =>
    api.get<PendingInvite[]>(`${orgPath(orgId)}/invites`),
  createInvite: (orgId: string, role: Role): Promise<CreatedInvite> =>
    api.post<CreatedInvite>(`${orgPath(orgId)}/invites`, { role }),
  revokeInvite: (orgId: string, inviteId: string): Promise<void> =>
    api.delete(`${orgPath(orgId)}/invites/${encodeURIComponent(inviteId)}`),

  audit: (orgId: string, cursor: string | null, limit = 50): Promise<Page<AuditEvent>> =>
    api.get<Page<AuditEvent>>(`${orgPath(orgId)}/audit`, { cursor, limit }),
};
