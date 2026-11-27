import { useEffect, useRef, useState } from 'react';
import { useGetIdentity } from '@refinedev/core';
import axios from 'axios';
import { LoaderCircle, Video } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useGroupContext } from '../../components/layout/GroupContext';
import { LiveRoom } from '../../components/live-room/LiveRoom';
import { Button } from '../../components/ui/button';
import { apiClient, type AuthIdentity, type MeetingRecord } from '../../types/api.types';
import { AttendanceTab } from './AttendanceTab';

interface JoinMeetingResponse {
  token: string;
  livekitUrl: string;
  meeting: MeetingRecord;
}

interface JoinError {
  message: string;
  status?: number;
}

export function LiveMeetingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<AuthIdentity>();
  const { selectedGroup } = useGroupContext();
  const [room, setRoom] = useState<JoinMeetingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinError, setJoinError] = useState<JoinError | null>(null);
  const [endingMeetingId, setEndingMeetingId] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const activeMeetingId = useRef(id);
  activeMeetingId.current = id;

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setJoinError({ message: 'A meeting ID is required.' });
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setJoinError(null);
    setRoom(null);

    apiClient
      .post<JoinMeetingResponse>(
        `/api/meetings/${encodeURIComponent(id)}/join`,
        {},
        { signal: controller.signal },
      )
      .then((response) => {
        setRoom(response.data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const message = axios.isAxiosError<{ error?: string }>(error)
          ? error.response?.data?.error ?? error.message
          : error instanceof Error
            ? error.message
            : 'Could not join this meeting.';
        setJoinError({ message, status });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [id]);

  async function endMeeting() {
    const meetingId = id;
    if (!meetingId || endingMeetingId === meetingId) {
      return;
    }

    setEndingMeetingId(meetingId);
    try {
      await apiClient.post(`/api/meetings/${encodeURIComponent(meetingId)}/end`);
      if (activeMeetingId.current !== meetingId) {
        return;
      }
      toast.success('Meeting ended for everyone.');
      navigate('/meetings');
    } catch (error) {
      if (activeMeetingId.current !== meetingId) {
        return;
      }
      const message = axios.isAxiosError<{ error?: string }>(error)
        ? error.response?.data?.error ?? error.message
        : error instanceof Error
          ? error.message
          : 'Could not end the meeting.';
      toast.error(message);
    } finally {
      setEndingMeetingId((current) => (current === meetingId ? null : current));
    }
  }

  const ending = endingMeetingId === id;
  const meetingRole = room
    ? identity?.memberships.find((membership) => membership.groupId === room.meeting.groupId)?.role
    : selectedGroup?.role;
  const canEndMeeting = meetingRole === 'OWNER' || meetingRole === 'MANAGER';

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <LoaderCircle className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <div>
          <h1 className="font-semibold">Verifying group membership</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Checking access before connecting to the meeting…
          </p>
        </div>
      </div>
    );
  }

  if (joinError || !room) {
    const title =
      joinError?.status === 410
        ? 'Meeting link expired'
        : joinError?.status === 403
          ? 'Access denied'
          : 'Unable to join meeting';
    return (
      <section className="mx-auto max-w-xl rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <Video className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {joinError?.message ?? 'The meeting could not be opened.'}
        </p>
        <Button className="mt-6" onClick={() => navigate('/meetings')}>
          Back to Meetings
        </Button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Live meeting</p>
          <h1 className="text-2xl font-semibold tracking-tight">{room.meeting.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/meetings')}>
            Back to Meetings
          </Button>
          {canEndMeeting && (
            <Button
              type="button"
              variant="destructive"
              disabled={ending}
              onClick={() => void endMeeting()}
            >
              {ending
                ? 'Ending meeting…'
                : disconnected
                  ? 'Retry Ending Meeting'
                  : 'End Meeting for All'}
            </Button>
          )}
        </div>
      </header>

      <LiveRoom
        livekitUrl={room.livekitUrl}
        token={room.token}
        recordAudio={room.meeting.recordAudio}
        onDisconnected={() => {
          setDisconnected(true);
          if (!canEndMeeting) {
            navigate('/meetings');
          }
        }}
      />
      {disconnected && canEndMeeting && (
        <p role="status" className="text-sm text-muted-foreground">
          You are disconnected. If meeting shutdown is still pending, retry ending the meeting.
        </p>
      )}
      <AttendanceTab meetingId={room.meeting.id} />
    </div>
  );
}