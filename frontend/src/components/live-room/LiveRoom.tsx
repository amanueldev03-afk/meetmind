import '@livekit/components-styles';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { ConsentBanner } from './ConsentBanner';

interface LiveRoomProps {
  livekitUrl: string;
  token: string;
  recordAudio: boolean;
  onDisconnected: () => void;
}

export function LiveRoom({
  livekitUrl,
  token,
  recordAudio,
  onDisconnected,
}: LiveRoomProps) {
  return (
    <div className="livekit-room flex h-[min(75vh,800px)] min-h-[480px] flex-col overflow-hidden rounded-xl border bg-black">
      {recordAudio && <ConsentBanner />}
      <LiveKitRoom
        serverUrl={livekitUrl}
        token={token}
        connect
        onDisconnected={onDisconnected}
        data-lk-theme="default"
        className="min-h-0 flex-1"
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
