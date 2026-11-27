import { useEffect, useState } from 'react';
import { useList, useUpdate } from '@refinedev/core';
import { CalendarDays, Clock3, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { useGroupContext } from '../../components/layout/GroupContext';
import { ScheduleMeetingModal } from './ScheduleMeetingModal';
import type { MeetingRecord } from '../../types/api.types';

const statusVariants = {
  SCHEDULED: 'outline',
  LIVE: 'default',
  ENDING: 'secondary',
  ENDED: 'secondary',
  CANCELLED: 'destructive',
} as const;

function formatLocalTime(value: string | null): string {
  if (!value) {
    return 'No expiry';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function getAvailability(meeting: MeetingRecord, now: number): { label: string; tone: string } {
  if (meeting.status === 'CANCELLED') {
    return { label: 'Cancelled', tone: 'border-destructive/30 bg-destructive/10 text-destructive' };
  }
  if (meeting.status === 'ENDED') {
    return { label: 'Ended', tone: 'border-border bg-muted text-muted-foreground' };
  }
  if (meeting.status === 'ENDING') {
    return {
      label: 'Ending',
      tone: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
    };
  }

  const scheduledAt = new Date(meeting.scheduledAt).getTime();
  const expiresAt = meeting.expiresAt ? new Date(meeting.expiresAt).getTime() : null;

  if (expiresAt !== null && now > expiresAt) {
    return { label: 'Expired', tone: 'border-border bg-muted text-muted-foreground' };
  }
  if (meeting.status !== 'LIVE' && scheduledAt > now) {
    return {
      label: `Upcoming · starts in ${formatCountdown(scheduledAt - now)}`,
      tone: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
    };
  }
  if (expiresAt !== null && expiresAt - now <= 2 * 60_000) {
    return {
      label: `Closing Soon · closes in ${formatCountdown(expiresAt - now)}`,
      tone: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
    };
  }
  return {
    label: expiresAt === null
      ? 'Open to Join'
      : `Open to Join · closes in ${formatCountdown(expiresAt - now)}`,
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  };
}

export function MeetingsListPage() {
  const [now, setNow] = useState(() => Date.now());
  const navigate = useNavigate();
  const { selectedGroup, selectedGroupId } = useGroupContext();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useList<MeetingRecord>({
    resource: 'meetings',
    meta: selectedGroupId ? { groupId: selectedGroupId } : undefined,
    queryOptions: { enabled: Boolean(selectedGroupId) },
    successNotification: false,
    errorNotification: false,
  });
  const { mutate: updateMeeting, isLoading: isCancelling } = useUpdate<MeetingRecord>({
    successNotification: false,
    errorNotification: false,
  });
  const meetings = data?.data ?? [];
  const canManage = selectedGroup?.role === 'OWNER' || selectedGroup?.role === 'MANAGER';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function cancelMeeting(meetingId: string) {
    updateMeeting(
      {
        resource: 'meetings',
        id: meetingId,
        values: { status: 'CANCELLED' },
      },
      {
        onSuccess: () => {
          toast.success('Meeting cancelled.');
          void refetch();
        },
        onError: (cancelError) => {
          toast.error(cancelError.message || 'Could not cancel the meeting.');
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Workspace meetings</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Meetings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedGroup
              ? `Scheduled sessions for ${selectedGroup.title}.`
              : 'Select a linked group to view its meetings.'}
          </p>
        </div>
        {canManage && (
          <ScheduleMeetingModal onScheduled={() => void refetch()} />
        )}
      </header>

      {!selectedGroupId ? (
        <section className="rounded-xl border border-dashed bg-card p-10 text-center">
          <CalendarDays className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-medium">Choose a group</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a linked Telegram group to see its meeting schedule.
          </p>
        </section>
      ) : isLoading ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading meetings…
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-6 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Could not load meetings.'}
        </div>
      ) : meetings.length === 0 ? (
        <section className="rounded-xl border border-dashed bg-card p-10 text-center">
          <CalendarDays className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-medium">No meetings scheduled</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? 'Schedule a meeting to get your group started.'
              : 'Meetings scheduled for this group will appear here.'}
          </p>
        </section>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Meeting</TableHead>
                <TableHead>Scheduled Start Time</TableHead>
                <TableHead>Link Closes At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead>Series</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meetings.map((meeting) => {
                const availability = getAvailability(meeting, now);
                return (
                  <TableRow key={meeting.id}>
                    <TableCell className="min-w-52">
                      <p className="font-medium">{meeting.title}</p>
                      {meeting.agenda && (
                        <p className="mt-1 max-w-sm truncate text-xs text-muted-foreground">
                          {meeting.agenda}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock3 className="size-4" />
                        {formatLocalTime(meeting.scheduledAt)}
                      </span>
                    </TableCell>
                    <TableCell>{formatLocalTime(meeting.expiresAt)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[meeting.status]}>{meeting.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${availability.tone}`}
                      >
                        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                        {availability.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      {meeting.seriesId ? (
                        <Badge variant="secondary">Recurring</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={meeting.status === 'ENDING'}
                          onClick={() => navigate(`/meetings/${meeting.id}/join`)}
                        >
                          <Video />
                          Join Meeting Room
                        </Button>
                        {canManage && meeting.status === 'SCHEDULED' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={isCancelling}
                            onClick={() => cancelMeeting(meeting.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}