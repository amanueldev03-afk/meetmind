import { ChevronsUpDown } from 'lucide-react';
import { Button } from '../ui/button';
import { useGroupContext } from './GroupContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export function GroupSwitcher() {
  const { groups, selectedGroupId, setSelectedGroupId, loading, error, refreshGroups } = useGroupContext();

  if (loading) {
    return <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />;
  }

  if (error) {
    return (
      <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void refreshGroups().catch(() => undefined)}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
        No linked groups
      </div>
    );
  }

  return (
    <Select
      items={groups.map((group) => ({ value: group.id, label: group.title }))}
      value={selectedGroupId ?? ''}
      onValueChange={(value) => {
        if (value) setSelectedGroupId(value);
      }}
    >
      <SelectTrigger aria-label="Select workspace group" className="w-full">
        <SelectValue placeholder="Choose a group" />
        <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectItem key={group.id} value={group.id}>
            {group.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
