import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLogin } from '@refinedev/core';
import { ArrowRight, LockKeyhole, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

declare global {
  interface Window {
    onTelegramAuth?: (payload: Record<string, unknown>) => void;
  }
}

export function LoginPage() {
  const [telegramId, setTelegramId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const widgetContainer = useRef<HTMLDivElement>(null);
  const { mutateAsync: login, isLoading } = useLogin<Record<string, unknown>>();
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  useEffect(() => {
    if (!botUsername || !widgetContainer.current) return;

    window.onTelegramAuth = async (payload) => {
      setErrorMessage('');
      const result = await login(payload);
      if (!result.success) {
        setErrorMessage(result.error?.message ?? 'Telegram login failed.');
      }
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    widgetContainer.current.appendChild(script);

    return () => {
      window.onTelegramAuth = undefined;
      script.remove();
    };
  }, [botUsername, login]);

  async function submitDevLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    const result = await login({ telegramId: Number(telegramId) });
    if (!result.success) {
      setErrorMessage(result.error?.message ?? 'Developer login failed.');
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/40 px-4 py-12">
      <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-20 size-96 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-6" />
          </div>
          <p className="text-sm font-semibold tracking-wide text-primary">MEETMIND</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your team, in sync.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to turn your conversations into clear next steps.
          </p>
        </div>

        <Card className="border-0 shadow-xl shadow-foreground/5 ring-1 ring-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>Continue with your Telegram account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {botUsername && (
              <div className="flex min-h-12 justify-center" ref={widgetContainer} />
            )}

            {botUsername && isLocalhost && (
              <div className="relative flex items-center">
                <div className="grow border-t" />
                <span className="mx-3 text-xs text-muted-foreground">OR USE LOCAL ACCESS</span>
                <div className="grow border-t" />
              </div>
            )}

            {isLocalhost ? (
              <form className="space-y-4" onSubmit={submitDevLogin}>
                <div className="space-y-2">
                  <Label htmlFor="telegramId">Telegram user ID</Label>
                  <Input
                    id="telegramId"
                    inputMode="numeric"
                    pattern="[0-9]+"
                    placeholder="e.g. 123456789"
                    required
                    value={telegramId}
                    onChange={(event) => setTelegramId(event.target.value)}
                  />
                </div>
                <Button className="w-full" type="submit" disabled={isLoading || !telegramId}>
                  <LockKeyhole />
                  Developer quick login
                  <ArrowRight className="ml-auto" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Available only on localhost. Use an existing Telegram account.
                </p>
              </form>
            ) : !botUsername ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Telegram sign-in is not configured. Please contact your administrator.
              </p>
            ) : null}

            {errorMessage && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Secure access for your connected Telegram workspaces.
        </p>
      </div>
    </main>
  );
}