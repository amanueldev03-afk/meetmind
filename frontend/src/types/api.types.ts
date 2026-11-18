import axios from 'axios';

export type GroupRole = 'OWNER' | 'MANAGER' | 'MEMBER';

export interface UserProfile {
  id: string;
  displayName: string;
  email: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  avatarUrl: string | null;
  isSystemAdmin: boolean;
  createdAt: string;
}

export interface GroupMembership {
  groupId: string;
  role: GroupRole;
}

export interface TelegramGroup {
  id: string;
  title: string;
  telegramChatId: string;
  retentionDays: number;
  role: GroupRole;
}

export interface GroupMember {
  userId: string;
  displayName: string;
  telegramUsername: string | null;
  avatarUrl: string | null;
  role: GroupRole;
  lastVerifiedAt: string;
}

export interface AuthIdentity {
  user: UserProfile;
  memberships: GroupMembership[];
}

export interface AuthResponse extends AuthIdentity {
  token: string;
}

export const AUTH_TOKEN_KEY = 'meetmind.auth.token';
export const AUTH_USER_KEY = 'meetmind.auth.user';
export const AUTH_MEMBERSHIPS_KEY = 'meetmind.auth.memberships';
export const SELECTED_GROUP_KEY = 'meetmind.selectedGroupId';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function saveIdentity(identity: AuthIdentity): void {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(identity.user));
  localStorage.setItem(AUTH_MEMBERSHIPS_KEY, JSON.stringify(identity.memberships));
}

export function clearAuthStorage(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_MEMBERSHIPS_KEY);
  localStorage.removeItem(SELECTED_GROUP_KEY);
}