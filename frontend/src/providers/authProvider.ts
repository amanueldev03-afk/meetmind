import type { AuthProvider } from '@refinedev/core';
import axios from 'axios';
import {
  apiClient,
  AUTH_TOKEN_KEY,
  beginAuthSession,
  captureAuthSession,
  clearAuthStorage,
  isAuthSessionCurrent,
  saveIdentity,
  type AuthIdentity,
  type AuthResponse,
  type AuthSessionSnapshot,
} from '../types/api.types';

function isAuthResponse(value: unknown): value is AuthResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'token' in value &&
    'user' in value &&
    'memberships' in value
  );
}

async function loadIdentity(session: AuthSessionSnapshot): Promise<AuthIdentity | null> {
  if (!session.token) {
    throw new Error('Authentication is required.');
  }

  const response = await apiClient.get<AuthIdentity>('/api/auth/me', {
    headers: { Authorization: `Bearer ${session.token}` },
    authSessionRevision: session.revision,
  });
  if (!isAuthSessionCurrent(session)) {
    return null;
  }

  saveIdentity(response.data);
  return response.data;
}

async function getCurrentIdentity(): Promise<AuthIdentity> {
  while (true) {
    const session = captureAuthSession();
    if (!session.token) {
      if (!isAuthSessionCurrent(session)) continue;
      throw new Error('Authentication is required.');
    }

    try {
      const identity = await loadIdentity(session);
      if (identity && isAuthSessionCurrent(session)) {
        return identity;
      }
    } catch (error) {
      if (isAuthSessionCurrent(session)) {
        throw error;
      }
    }
  }
}

async function checkCurrentSession() {
  while (true) {
    const session = captureAuthSession();
    if (!session.token) {
      if (!isAuthSessionCurrent(session)) continue;
      return { authenticated: false, redirectTo: '/login' };
    }

    try {
      const identity = await loadIdentity(session);
      if (identity && isAuthSessionCurrent(session)) {
        return { authenticated: true };
      }
    } catch (error) {
      if (!isAuthSessionCurrent(session)) continue;

      const unauthorized = axios.isAxiosError(error) && error.response?.status === 401;
      if (unauthorized) {
        clearAuthStorage();
      }
      return {
        authenticated: false,
        redirectTo: '/login',
        logout: unauthorized,
        error: error as Error,
      };
    }
  }
}

function requestSession(error: unknown): AuthSessionSnapshot | null {
  if (!axios.isAxiosError(error) || !error.config) {
    return null;
  }

  const authorization =
    error.config.headers.get('Authorization') ?? error.config.headers.Authorization;
  const token =
    typeof authorization === 'string'
      ? authorization.replace(/^Bearer\s+/i, '')
      : null;
  const revision = error.config.authSessionRevision;
  if (!token || revision === undefined) {
    return null;
  }

  return { token, revision };
}

async function handleUnauthorized(error: unknown) {
  const session = requestSession(error);
  if (!session || !isAuthSessionCurrent(session)) {
    const current = await checkCurrentSession();
    return current.authenticated
      ? {}
      : {
          logout: current.logout,
          redirectTo: current.redirectTo,
          error: current.error,
        };
  }

  clearAuthStorage();
  return { logout: true, redirectTo: '/login' };
}

export const authProvider: AuthProvider = {
  login: async (params: Record<string, unknown>) => {
    const loginRevision = beginAuthSession();
    try {
      const isDevLogin = params.telegramId !== undefined;
      const response = isDevLogin
        ? await apiClient.post<AuthResponse>('/api/auth/dev-login', {
            telegramId: Number(params.telegramId),
          })
        : await apiClient.post<AuthResponse>('/api/auth/telegram', params);

      if (!isAuthResponse(response.data)) {
        return { success: false, error: new Error('The server returned an invalid login response.') };
      }

      if (loginRevision !== captureAuthSession().revision) {
        return { success: false, error: new Error('This login attempt is no longer active.') };
      }
      localStorage.setItem(AUTH_TOKEN_KEY, response.data.token);
      saveIdentity(response.data);
      return { success: true, redirectTo: '/' };
    } catch (error) {
      const message = axios.isAxiosError<{ error?: string }>(error)
        ? error.response?.data?.error ?? error.message
        : error instanceof Error
          ? error.message
          : 'Unable to log in.';
      return { success: false, error: new Error(message) };
    }
  },
  logout: async () => {
    clearAuthStorage();
    return { success: true, redirectTo: '/login' };
  },
  check: checkCurrentSession,
  getIdentity: async () => {
    return getCurrentIdentity();
  },
  onError: async (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return handleUnauthorized(error);
    }
    return {};
  },
};