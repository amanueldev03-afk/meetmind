import { ChevronsUpDown } from 'lucide-react';
import { useGroupContext } from './GroupContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export function GroupSwitcher() {
  const { groups, selectedGroupId, setSelectedGroupId, loading } = useGroupContext();

  if (loading) {
    return <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />;
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
