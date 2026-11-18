import type { AccessControlProvider } from '@refinedev/core';
import {
  AUTH_MEMBERSHIPS_KEY,
  AUTH_USER_KEY,
  SELECTED_GROUP_KEY,
  type GroupMembership,
  type UserProfile,
} from '../types/api.types';

function readStored<T>(key: string): T | undefined {
  const value = localStorage.getItem(key);
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const user = readStored<UserProfile>(AUTH_USER_KEY);
    if (user?.isSystemAdmin) {
      return { can: true };
    }

    const memberships = readStored<GroupMembership[]>(AUTH_MEMBERSHIPS_KEY) ?? [];
    const groupId = localStorage.getItem(SELECTED_GROUP_KEY);
    const role = memberships.find((membership) => membership.groupId === groupId)?.role;

    if (resource === 'groups' && (action === 'update' || action === 'edit')) {
      return { can: role === 'OWNER', reason: 'Only group owners can change group settings.' };
    }

    if ((resource === 'groupMembers' || resource === 'members') && (action === 'update' || action === 'edit')) {
      return { can: role === 'OWNER', reason: 'Only group owners can change member roles.' };
    }

    if (resource === 'systemAdmin' || resource === 'admin') {
      return { can: false, reason: 'System administrator access is required.' };
    }

    return { can: Boolean(role), reason: 'Select a linked group to continue.' };
  },
};