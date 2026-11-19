import { Badge } from '../ui/badge';
import { useGroupContext } from './GroupContext';
import { AUTH_USER_KEY, type UserProfile } from '../../types/api.types';

export function RoleBadge({ className = '' }: { className?: string }) {
  const { selectedGroup } = useGroupContext();
  let isSystemAdmin = false;
  const storedUser = localStorage.getItem(AUTH_USER_KEY);
  if (storedUser) {
    try {
      isSystemAdmin = (JSON.parse(storedUser) as UserProfile).isSystemAdmin;
    } catch {
      isSystemAdmin = false;
    }
  }

  const label = isSystemAdmin ? 'SYSTEM ADMIN' : selectedGroup?.role ?? 'MEMBER';
  const style =
    label === 'OWNER'
      ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300'
      : label === 'MANAGER'
        ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300'
        : label === 'SYSTEM ADMIN'
          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
          : 'border-border bg-muted text-muted-foreground';

  return (
    <Badge variant="outline" className={`${style} ${className}`}>
      {label}
    </Badge>
  );
}
