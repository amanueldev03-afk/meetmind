import { useEffect, useState, type FormEvent } from 'react';
import { useList } from '@refinedev/core';
import { LoaderCircle, Save, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { useGroupContext } from '../../components/layout/GroupContext';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { apiClient, type GroupMember, type GroupRole } from '../../types/api.types';

function errorText(error: unknown): string {
  if (
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
  ) {
    return error.response.data.error;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function GroupSettingsPage() {
  const {
    selectedGroup,
    selectedGroupId,
    updateSelectedGroup,
  } = useGroupContext();
  const [retentionDays, setRetentionDays] = useState(selectedGroup?.retentionDays ?? 30);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingMemberIds, setSavingMemberIds] = useState<Set<string>>(() => new Set());
  const {
    data,
    isLoading: loadingMembers,
    isError: memberQueryFailed,
    error: memberQueryError,
    isFetching: refreshingMembers,
    refetch,
  } = useList<GroupMember>({
    resource: 'groupMembers',
    meta: { groupId: selectedGroupId },
    queryOptions: { enabled: Boolean(selectedGroupId) },
  });
  const members = data?.data ?? [];

  useEffect(() => {
    setRetentionDays(selectedGroup?.retentionDays ?? 30);
  }, [selectedGroup?.id, selectedGroup?.retentionDays]);

  async function updateRole(userId: string, role: GroupRole) {
    if (!selectedGroupId) return;
    setSavingMemberIds((current) => new Set(current).add(userId));
    try {
      await apiClient.patch(
        `/api/groups/${encodeURIComponent(selectedGroupId)}/members/${encodeURIComponent(userId)}/role`,
        { role },
      );
      toast.success('Member role updated.');
      await refetch();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSavingMemberIds((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }
  }

  async function saveRetention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroupId || !Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
      toast.error('Retention must be a whole number between 1 and 365 days.');
      return;
    }
    setSavingSettings(true);
    try {
      const response = await apiClient.patch<{ group: { retentionDays: number } }>(
        `/api/groups/${encodeURIComponent(selectedGroupId)}`,
        { retentionDays },
      );
      updateSelectedGroup({ retentionDays: response.data.group.retentionDays });
      toast.success('Group settings saved.');
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSavingSettings(false);
    }
  }

  if (!selectedGroup) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <UsersRound className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-3 font-semibold">No group selected</h1>
        <p className="mt-1 text-sm text-muted-foreground">Link or select a workspace to manage its settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Workspace administration</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{selectedGroup.title}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data retention</CardTitle>
          <CardDescription>Choose how many days meeting data is retained for this group.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveRetention} className="flex max-w-lg flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="retentionDays">Retention period (days)</Label>
              <Input
                id="retentionDays"
                type="number"
                min={1}
                max={365}
                step={1}
                required
                value={retentionDays}
                onChange={(event) => setRetentionDays(Number(event.target.value))}
              />
            </div>
            <Button type="submit" disabled={savingSettings}>
              {savingSettings ? <LoaderCircle className="animate-spin" /> : <Save />}
              Save settings
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members <span className="ml-1 text-muted-foreground">({members.length})</span></CardTitle>
          <CardDescription>People who currently belong to this Telegram group.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingMembers ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Loading members…
            </div>
          ) : memberQueryFailed ? (
            <div className="space-y-3 py-8 text-center">
              <p role="alert" className="text-sm text-destructive">
                Could not load group members: {errorText(memberQueryError)}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refetch()}
                disabled={refreshingMembers}
              >
                {refreshingMembers && <LoaderCircle className="animate-spin" />}
                Retry
              </Button>
            </div>
          ) : members.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No members found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last verified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
                          <AvatarFallback>
                            {member.displayName
                              .split(/\s+/)
                              .map((part) => part[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{member.displayName}</div>
                          <div className="text-xs text-muted-foreground">
                            {member.telegramUsername ? `@${member.telegramUsername}` : 'No username'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.role === 'OWNER' ? (
                        <span className="text-sm font-medium">OWNER</span>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(value) => {
                            if (value === 'MANAGER' || value === 'MEMBER') {
                              void updateRole(member.userId, value);
                            }
                          }}
                          disabled={savingMemberIds.has(member.userId)}
                        >
                          <SelectTrigger aria-label={`Role for ${member.displayName}`} className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MANAGER">MANAGER</SelectItem>
                            <SelectItem value="MEMBER">MEMBER</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.lastVerifiedAt
                        ? new Date(member.lastVerifiedAt).toLocaleDateString()
                        : 'Not verified'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}