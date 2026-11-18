import { Authenticated, CanAccess, Refine, useGetIdentity } from '@refinedev/core';
import routerBindings from '@refinedev/react-router-v6';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { CalendarDays, CheckCheck, MessagesSquare, UsersRound } from 'lucide-react';
import { Navbar } from './components/layout/Navbar';
import { GroupProvider, useGroupContext } from './components/layout/GroupContext';
import { Sidebar } from './components/layout/Sidebar';
import { Toaster } from './components/ui/sonner';
import { LoginPage } from './features/auth/LoginPage';
import { GroupSettingsPage } from './features/group-settings/GroupSettingsPage';
import { accessControlProvider } from './providers/accessControl';
import { authProvider } from './providers/authProvider';
import { dataProvider } from './providers/dataProvider';
import type { AuthIdentity } from './types/api.types';

function WorkspaceLayout() {
  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <main className="flex-1 bg-muted/20 p-5 md:p-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function DashboardPage() {
  const { data } = useGetIdentity<AuthIdentity>();
  const { selectedGroup, groups } = useGroupContext();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">Your workspace at a glance</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Good to see you, {data?.user.displayName.split(' ')[0] ?? 'there'}.
        </h1>
        <p className="mt-2 text-muted-foreground">
          {selectedGroup
            ? `You’re viewing ${selectedGroup.title}.`
            : 'Select a linked group to explore your workspace.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Meetings', value: 'Stay in sync', icon: CalendarDays },
          { label: 'Action items', value: 'Keep momentum', icon: CheckCheck },
          { label: 'Group members', value: selectedGroup ? 'View your team' : 'Choose a group', icon: UsersRound },
          { label: 'Workspaces', value: String(groups.length), icon: MessagesSquare },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{label}</p>
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-5 text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold">Make your meetings more actionable</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          MeetMind brings your Telegram team workspace into focus, so decisions and follow-ups are easier to find.
        </p>
      </section>
    </div>
  );
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-xl border bg-card p-8">
      <p className="text-sm text-muted-foreground">Workspace</p>
      <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </section>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Refine
        routerProvider={routerBindings}
        authProvider={authProvider}
        dataProvider={dataProvider}
        accessControlProvider={accessControlProvider}
        resources={[
          { name: 'groups', list: '/' },
          { name: 'groupMembers', list: '/group-settings' },
          { name: 'meetings', list: '/meetings' },
          { name: 'actionItems', list: '/action-items' },
          { name: 'systemAdmin', list: '/admin' },
        ]}
        options={{ syncWithLocation: true, warnWhenUnsavedChanges: false }}
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <Authenticated
                key="authenticated-workspace"
                fallback={<Navigate to="/login" replace />}
                loading={
                  <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
                    Checking your session…
                  </div>
                }
              >
                <GroupProvider>
                  <WorkspaceLayout />
                </GroupProvider>
              </Authenticated>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route
              path="meetings"
              element={
                <PlaceholderPage
                  title="Meetings"
                  description="Your connected group meetings will appear here."
                />
              }
            />
            <Route
              path="action-items"
              element={
                <PlaceholderPage
                  title="Action items"
                  description="Keep track of follow-ups from your team meetings."
                />
              }
            />
            <Route
              path="group-settings"
              element={
                <CanAccess resource="groups" action="update" fallback={<Navigate to="/" replace />}>
                  <GroupSettingsPage />
                </CanAccess>
              }
            />
            <Route
              path="admin"
              element={
                <CanAccess resource="systemAdmin" action="list" fallback={<Navigate to="/" replace />}>
                  <PlaceholderPage
                    title="System admin console"
                    description="System-wide administration tools."
                  />
                </CanAccess>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </Refine>
    </BrowserRouter>
  );
}