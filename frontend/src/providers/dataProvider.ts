import type {
  BaseRecord,
  DataProvider,
  DeleteOneParams,
  DeleteOneResponse,
  GetListParams,
  GetListResponse,
  GetOneParams,
  GetOneResponse,
  UpdateParams,
  UpdateResponse,
  CreateParams,
  CreateResponse,
} from '@refinedev/core';
import { apiClient, type GroupMember, type TelegramGroup } from '../types/api.types';

function endpoint(resource: string): string {
  if (resource.startsWith('/api/')) {
    return resource;
  }
  const normalized = resource.replace(/^\/+/, '');
  return `/api/${normalized}`;
}

function groupIdFromMeta(meta: Record<string, unknown> | undefined): string {
  const groupId = meta?.groupId;
  if (typeof groupId !== 'string' || groupId.length === 0) {
    throw new Error('A groupId is required to access group members.');
  }
  return groupId;
}

export const dataProvider: DataProvider = {
  getList: async <TData extends BaseRecord = BaseRecord>({
    resource,
    meta,
  }: GetListParams): Promise<GetListResponse<TData>> => {
    if (resource === 'groups') {
      const response = await apiClient.get<{ groups: Array<Omit<TelegramGroup, 'telegramChatId'> & { telegramGroupId: string }> }>('/api/groups');
      return {
        data: response.data.groups.map((group) => ({
          ...group,
          telegramChatId: group.telegramGroupId,
        })) as unknown as TData[],
        total: response.data.groups.length,
      };
    }

    if (resource === 'groupMembers' || resource === 'members') {
      const groupId = groupIdFromMeta(meta);
      const response = await apiClient.get<{ members: GroupMember[] }>(
        `/api/groups/${encodeURIComponent(groupId)}/members`,
      );
      return {
        data: response.data.members as unknown as TData[],
        total: response.data.members.length,
      };
    }

    const response = await apiClient.get<unknown>(endpoint(resource));
    const data =
      typeof response.data === 'object' && response.data !== null
        ? Object.values(response.data).find(Array.isArray) ?? []
        : [];
    return { data: data as TData[], total: data.length };
  },
  getOne: async <TData extends BaseRecord = BaseRecord>({
    resource,
    id,
    meta,
  }: GetOneParams): Promise<GetOneResponse<TData>> => {
    if (resource === 'groups') {
      const response = await apiClient.get<{ groups: TelegramGroup[] }>('/api/groups');
      const group = response.data.groups.find((item) => item.id === String(id));
      if (!group) {
        throw new Error('Group not found.');
      }
      return { data: group as unknown as TData };
    }

    if (resource === 'groupMembers' || resource === 'members') {
      const groupId = groupIdFromMeta(meta);
      const response = await apiClient.get<{ members: GroupMember[] }>(
        `/api/groups/${encodeURIComponent(groupId)}/members`,
      );
      const member = response.data.members.find((item) => item.userId === String(id));
      if (!member) {
        throw new Error('Group member not found.');
      }
      return { data: member as unknown as TData };
    }

    const response = await apiClient.get(endpoint(`${resource}/${encodeURIComponent(String(id))}`));
    return { data: response.data as TData };
  },
  update: async <TData extends BaseRecord = BaseRecord, TVariables = {}>({
    resource,
    id,
    variables,
    meta,
  }: UpdateParams<TVariables>): Promise<UpdateResponse<TData>> => {
    if (resource === 'groups') {
      const response = await apiClient.patch<{ group: BaseRecord }>(
        `/api/groups/${encodeURIComponent(String(id))}`,
        variables,
      );
      return { data: response.data.group as TData };
    }

    if (resource === 'groupMembers' || resource === 'members') {
      const groupId = groupIdFromMeta(meta);
      const response = await apiClient.patch<{ membership: BaseRecord }>(
        `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(String(id))}/role`,
        variables,
      );
      return { data: response.data.membership as TData };
    }

    const response = await apiClient.patch(
      endpoint(`${resource}/${encodeURIComponent(String(id))}`),
      variables,
    );
    return { data: response.data as TData };
  },
  create: async <TData extends BaseRecord = BaseRecord, TVariables = {}>({
    resource,
    variables,
  }: CreateParams<TVariables>): Promise<CreateResponse<TData>> => {
    const response = await apiClient.post(endpoint(resource), variables);
    return { data: response.data as TData };
  },
  deleteOne: async <TData extends BaseRecord = BaseRecord, TVariables = {}>({
    resource,
    id,
  }: DeleteOneParams<TVariables>): Promise<DeleteOneResponse<TData>> => {
    const response = await apiClient.delete(endpoint(`${resource}/${encodeURIComponent(String(id))}`));
    return { data: response.data as TData };
  },
  getApiUrl: () => apiClient.defaults.baseURL ?? '',
};