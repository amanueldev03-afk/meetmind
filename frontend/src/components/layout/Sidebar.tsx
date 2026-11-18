import { Link, useLocation } from 'react-router-dom';
import { Activity, CalendarDays, ClipboardList, LayoutDashboard, Settings2, Shield } from 'lucide-react';
import { GroupSwitcher } from './GroupSwitcher';
import { RoleBadge } from './RoleBadge';
import { useGroupContext } from './GroupContext';
import { AUTH_USER_KEY, type UserProfile } from '../../types/api.types';

interface NavigationItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
}

export function Sidebar() {
  const { selectedGroup } = useGroupContext();
  const location = useLocation();
  let user: UserProfile | undefined;
  try {
    const stored = localStorage.getItem(AUTH_USER_KEY);
    user = stored ? (JSON.parse(stored) as UserProfile) : undefined;
  } catch {
    user = undefined;
  }

  const navigation: NavigationItem[] = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Meetings', path: '/meetings', icon: CalendarDays },
    { label: 'Action items', path: '/action-items', icon: ClipboardList },
  ];
  if (selectedGroup?.role === 'OWNER') {
    navigation.push({ label: 'Group settings', path: '/group-settings', icon: Settings2 });
  }
  if (user?.isSystemAdmin) {
    navigation.push({ label: 'System admin console', path: '/admin', icon: Shield });
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-b bg-card p-4 md:min-h-screen md:w-64 md:border-r md:border-b-0">
      <Link to="/" className="mb-8 flex items-center gap-2 px-2 text-lg font-semibold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Activity className="size-4" />
        </span>
        MeetMind
      </Link>
      <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Workspace
      </p>
      <GroupSwitcher />
      <div className="my-4 flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">Your access</span>
        <RoleBadge />
      </div>
      <nav className="mt-2 flex gap-1 overflow-x-auto md:flex-col">
        {navigation.map(({ label, path, icon: Icon }) => {
          const active = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden border-t pt-4 text-xs text-muted-foreground md:block">
        Meetings, understood.
      </div>
    </aside>
  );
}
