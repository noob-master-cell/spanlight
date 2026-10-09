import { API_PREFIX, api } from "./client";
import { TwoFactorRequiredError } from "./errors";
import type { AuthSession, InviteAcceptance, InvitePreview, LoginResult, Me, User } from "./types";

export interface Credentials {
  email: string;
  password: string;
}

export interface SignupInput extends Credentials {
  name: string;
}

export const authApi = {
  me: (): Promise<Me> => api.get<Me>(`${API_PREFIX}/auth/me`),
  /**
   * Resolves with the signed-in user. Rejects with `TwoFactorRequiredError` when the account has
   * two-factor authentication: the server has not signed anyone in yet.
   */
  login: async (input: Credentials): Promise<User> => {
    const result = await api.post<LoginResult>(`${API_PREFIX}/auth/login`, input);
    if (result.status === "totp_required") {
      throw new TwoFactorRequiredError(result.challenge, result.expires_at);
    }
    return result.user;
  },
  signup: (input: SignupInput): Promise<User> => api.post<User>(`${API_PREFIX}/auth/signup`, input),
  logout: (): Promise<void> => api.post<undefined>(`${API_PREFIX}/auth/logout`),
  demoSession: (): Promise<unknown> => api.post<unknown>(`${API_PREFIX}/demo/session`),
  sessions: (): Promise<AuthSession[]> => api.get<AuthSession[]>(`${API_PREFIX}/auth/sessions`),
  revokeSession: (sessionId: string): Promise<void> =>
    api.delete(`${API_PREFIX}/auth/sessions/${encodeURIComponent(sessionId)}`),
  previewInvite: (token: string): Promise<InvitePreview> =>
    api.get<InvitePreview>(`${API_PREFIX}/invites/preview`, { token }),
  acceptInvite: (token: string): Promise<InviteAcceptance> =>
    api.post<InviteAcceptance>(`${API_PREFIX}/invites/accept`, { token }),
};
