import { useList } from '@refinedev/core';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import type { MeetingAttendanceRecord } from '../../types/api.types';

function participantDisplayName(record: MeetingAttendanceRecord): string {
  return record.displayName || record.participantName || 'Unknown participant';
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatTime(value: string | null): string {
  if (!value) {
    return 'Still in meeting';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function AttendanceTab({ meetingId }: { meetingId: string }) {
  const { data, isLoading, isError, error } = useList<MeetingAttendanceRecord>({
    resource: 'meetingAttendance',
    meta: { meetingId },
    queryOptions: { enabled: Boolean(meetingId) },
    successNotification: false,
    errorNotification: false,
  });
  const attendance = data?.data ?? [];

  return (
    <section className="space-y-3">
      <div role="status" aria-live="polite" className="sr-only">
        {isLoading
          ? 'Loading attendance.'
          : isError
            ? 'Attendance could not be loaded.'
            : attendance.length === 0
              ? 'Attendance loaded. No participants have joined yet.'
              : `Attendance loaded. ${attendance.length} participant${attendance.length === 1 ? '' : 's'}.`}
      </div>
      <div>
        <h2 className="text-lg font-semibold">Attendance</h2>
        <p className="text-sm text-muted-foreground">
          Participant join and leave times for this meeting.
        </p>
      </div>
      {isLoading ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          Loading attendance…
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-card p-5 text-sm text-destructive"
        >
          {error instanceof Error ? error.message : 'Could not load attendance.'}
        </div>
      ) : attendance.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          No participants have joined yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participant</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Left</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendance.map((record, index) => {
                const name = participantDisplayName(record);
                return (
                  <TableRow key={`${record.userId ?? name}-${record.joinedAt}-${index}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          {record.avatarUrl && <AvatarImage src={record.avatarUrl} alt="" />}
                          <AvatarFallback>{initials(name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{name}</p>
                          {record.telegramUsername && (
                            <p className="text-xs text-muted-foreground">
                              @{record.telegramUsername}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{formatTime(record.joinedAt)}</TableCell>
                    <TableCell>{formatTime(record.leftAt)}</TableCell>
                    <TableCell>{formatDuration(record.durationSeconds)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}