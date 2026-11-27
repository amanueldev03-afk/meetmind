import { AlertTriangle, Mic } from 'lucide-react';

export function ConsentBanner() {
  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">AI Recording &amp; Transcription Active</p>
        <p className="mt-0.5 text-sm">Audio is being captured for meeting notes.</p>
      </div>
      <Mic className="ml-auto mt-0.5 size-5 shrink-0" aria-hidden="true" />
    </div>
  );
}
