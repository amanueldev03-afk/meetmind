import { useGetIdentity, useLogout } from '@refinedev/core';
import { LogOut } from 'lucide-react';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import type { AuthIdentity } from '../../types/api.types';

export function Navbar() {
  const { data } = useGetIdentity<AuthIdentity>();
  const { mutate: logout, isLoading } = useLogout();
  const user = data?.user;
  const initials =
    user?.displayName
      .split(/\s+/)
      .map((name) => name[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? 'MM';

  return (
    <header className="flex min-h-16 items-center justify-between border-b bg-background px-5 md:px-8">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user?.displayName ?? 'Workspace'}</p>
        <p className="text-xs text-muted-foreground">
          {user?.telegramUsername ? `@${user.telegramUsername}` : 'MeetMind workspace'}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Avatar>
          {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <Button
          variant="ghost"
          size="sm"
          disabled={isLoading}
          onClick={() => logout()}
          aria-label="Log out"
        >
          <LogOut />
          <span className="hidden sm:inline">Log out</span>
        </Button>
      </div>
    </header>
  );
}
