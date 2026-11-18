import type { AuthProvider } from '@refinedev/core';
import axios from 'axios';
import {
  apiClient,
  AUTH_TOKEN_KEY,
  clearAuthStorage,
  saveIdentity,
  type AuthIdentity,
  type AuthResponse,
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

async function loadIdentity(): Promise<AuthIdentity> {
  const response = await apiClient.get<AuthIdentity>('/api/auth/me');
  saveIdentity(response.data);
  return response.data;
}

export const authProvider: AuthProvider = {
  login: async (params: Record<string, unknown>) => {
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
  check: async () => {
    if (!localStorage.getItem(AUTH_TOKEN_KEY)) {
      return { authenticated: false, redirectTo: '/login' };
    }

    try {
      await loadIdentity();
      return { authenticated: true };
    } catch (error) {
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
  },
  getIdentity: async () => {
    return loadIdentity();
  },
  onError: async (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearAuthStorage();
      return { logout: true, redirectTo: '/login' };
    }
    return {};
  },
};