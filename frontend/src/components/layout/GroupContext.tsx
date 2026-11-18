import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import {
  apiClient,
  SELECTED_GROUP_KEY,
  type TelegramGroup,
} from '../../types/api.types';

interface GroupContextValue {
  groups: TelegramGroup[];
  selectedGroupId: string | null;
  selectedGroup: TelegramGroup | undefined;
  loading: boolean;
  setSelectedGroupId: (groupId: string) => void;
  updateSelectedGroup: (changes: Partial<TelegramGroup>) => void;
  refreshGroups: () => Promise<void>;
}

const GroupContext = createContext<GroupContextValue | undefined>(undefined);

export function GroupProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<TelegramGroup[]>([]);
  const [selectedGroupId, setCurrentSelectedGroupId] = useState<string | null>(
    () => localStorage.getItem(SELECTED_GROUP_KEY),
  );
  const [loading, setLoading] = useState(true);

  const refreshGroups = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<{
        groups: Array<Omit<TelegramGroup, 'telegramChatId'> & { telegramGroupId: string }>;
      }>('/api/groups');
      const nextGroups = response.data.groups.map((group) => ({
        ...group,
        telegramChatId: group.telegramGroupId,
      }));
      setGroups(nextGroups);
      setCurrentSelectedGroupId((current) => {
        const stored = current ?? localStorage.getItem(SELECTED_GROUP_KEY);
        const selected = nextGroups.some((group) => group.id === stored)
          ? stored
          : nextGroups[0]?.id ?? null;
        if (selected) {
          localStorage.setItem(SELECTED_GROUP_KEY, selected);
        } else {
          localStorage.removeItem(SELECTED_GROUP_KEY);
        }
        return selected;
      });
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof error.response === 'object' &&
        error.response !== null &&
        'data' in error.response &&
        typeof error.response.data === 'object' &&
        error.response.data !== null &&
        'error' in error.response.data &&
        typeof error.response.data.error === 'string'
          ? error.response.data.error
          : error instanceof Error
            ? error.message
            : 'Could not load your groups.';
      toast.error(message);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshGroups().catch(() => undefined);
  }, [refreshGroups]);

  const setSelectedGroupId = useCallback((groupId: string) => {
    setCurrentSelectedGroupId(groupId);
    localStorage.setItem(SELECTED_GROUP_KEY, groupId);
  }, []);

  const updateSelectedGroup = useCallback(
    (changes: Partial<TelegramGroup>) => {
      setGroups((current) =>
        current.map((group) =>
          group.id === selectedGroupId ? { ...group, ...changes } : group,
        ),
      );
    },
    [selectedGroupId],
  );

  const value = useMemo(
    () => ({
      groups,
      selectedGroupId,
      selectedGroup: groups.find((group) => group.id === selectedGroupId),
      loading,
      setSelectedGroupId,
      updateSelectedGroup,
      refreshGroups,
    }),
    [groups, selectedGroupId, loading, setSelectedGroupId, updateSelectedGroup, refreshGroups],
  );

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroupContext(): GroupContextValue {
  const context = useContext(GroupContext);
  if (!context) {
    throw new Error('useGroupContext must be used within a GroupProvider.');
  }
  return context;
}
