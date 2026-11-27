import { useState, type FormEvent } from 'react';
import { useCreate } from '@refinedev/core';
import { CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { useGroupContext } from '../../components/layout/GroupContext';
import type { MeetingRecord } from '../../types/api.types';

interface ScheduleMeetingModalProps {
  onScheduled: () => void;
}

interface CreateMeetingValues {
  groupId: string;
  title: string;
  agenda?: string;
  scheduledAt: string;
  durationMinutes: number;
  recordAudio: boolean;
  isRecurring: boolean;
  recurringWeeks?: number;
}

function localDateTimeValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function ScheduleMeetingModal({ onScheduled }: ScheduleMeetingModalProps) {
  const { selectedGroup, selectedGroupId } = useGroupContext();
  const groupId = selectedGroupId;
  const canSchedule = selectedGroup?.role === 'OWNER' || selectedGroup?.role === 'MANAGER';
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 60 * 60_000)),
  );
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [recordAudio, setRecordAudio] = useState(true);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState('4');
  const { mutate: createMeeting, isLoading } = useCreate<MeetingRecord>({
    successNotification: false,
    errorNotification: false,
  });

  if (!canSchedule || !groupId) {
    return null;
  }
  const activeGroupId = groupId;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedDate = new Date(scheduledAt);
    if (Number.isNaN(parsedDate.getTime())) {
      toast.error('Choose a valid meeting date and time.');
      return;
    }

    const values: CreateMeetingValues = {
      groupId: activeGroupId,
      title: title.trim(),
      agenda: agenda.trim() || undefined,
      scheduledAt: parsedDate.toISOString(),
      durationMinutes: Number(durationMinutes),
      recordAudio,
      isRecurring,
      ...(isRecurring ? { recurringWeeks: Number(recurringWeeks) } : {}),
    };

    createMeeting(
      { resource: 'meetings', values },
      {
        onSuccess: () => {
          toast.success('Meeting scheduled & announced in Telegram');
          setOpen(false);
          setTitle('');
          setAgenda('');
          onScheduled();
        },
        onError: (error) => {
          toast.error(error.message || 'Could not schedule the meeting.');
        },
      },
    );
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <CalendarPlus />
        Schedule Meeting
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!isLoading) setOpen(nextOpen);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Schedule a meeting</DialogTitle>
              <DialogDescription>
                Plan a session for {selectedGroup.title}. Members will be notified in Telegram.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="meeting-title">Title</Label>
                <Input
                  id="meeting-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={isLoading}
                  minLength={3}
                  maxLength={150}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="meeting-agenda">Agenda</Label>
                <Textarea
                  id="meeting-agenda"
                  value={agenda}
                  onChange={(event) => setAgenda(event.target.value)}
                  disabled={isLoading}
                  maxLength={2000}
                  placeholder="What should the group cover?"
                  className="min-h-24"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="meeting-date">Date &amp; Time</Label>
                  <Input
                    id="meeting-date"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="meeting-duration">Duration</Label>
                  <Select
                    value={durationMinutes}
                    onValueChange={(value) => value && setDurationMinutes(value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger id="meeting-duration" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                      <SelectItem value="90">90 minutes</SelectItem>
                      <SelectItem value="120">120 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <Label htmlFor="meeting-record-audio">Enable AI Audio Recording</Label>
                <Switch
                  id="meeting-record-audio"
                  checked={recordAudio}
                  onCheckedChange={setRecordAudio}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="meeting-recurring">Recurring Weekly</Label>
                  <Switch
                    id="meeting-recurring"
                    checked={isRecurring}
                    onCheckedChange={setIsRecurring}
                    disabled={isLoading}
                  />
                </div>
                {isRecurring && (
                  <div className="grid gap-2">
                    <Label htmlFor="meeting-recurring-weeks">Number of weeks</Label>
                    <Input
                      id="meeting-recurring-weeks"
                      type="number"
                      min={2}
                      max={12}
                      step={1}
                      value={recurringWeeks}
                      onChange={(event) => setRecurringWeeks(event.target.value)}
                      disabled={isLoading}
                      required
                    />
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isLoading}
                onClick={() => {
                  if (!isLoading) setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Scheduling…' : 'Schedule Meeting'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}