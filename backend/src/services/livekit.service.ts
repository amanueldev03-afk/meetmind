import {
  AccessToken,
  RoomServiceClient,
  ServerError,
  WebhookReceiver,
  type WebhookEvent,
} from 'livekit-server-sdk';

export const meetingAccessTokenTtlMs = 10 * 60_000;

function getLiveKitCredentials(): { apiKey: string; apiSecret: string } {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured.');
  }
  return { apiKey, apiSecret };
}

export async function createMeetingAccessToken(params: {
  roomName: string;
  participantIdentity: string;
  participantName: string;
  isHost: boolean;
}): Promise<string> {
  const { apiKey, apiSecret } = getLiveKitCredentials();
  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity: params.participantIdentity,
    name: params.participantName,
    ttl: `${meetingAccessTokenTtlMs / 60_000}m`,
  });

  accessToken.addGrant({
    roomJoin: true,
    room: params.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: params.isHost,
  });

  return accessToken.toJwt();
}

export async function revokeMeetingAccessTokens(
  roomName: string,
  participantIdentities: string[],
): Promise<void> {
  if (participantIdentities.length === 0) {
    return;
  }

  const livekitUrl = process.env.LIVEKIT_URL;
  if (!livekitUrl) {
    throw new Error('LIVEKIT_URL must be configured to revoke meeting access tokens.');
  }

  const { apiKey, apiSecret } = getLiveKitCredentials();
  const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
  if ((await roomService.listRooms([roomName])).length === 0) {
    await roomService.createRoom({ name: roomName });
  }

  for (const identity of participantIdentities) {
    try {
      const revokeTokenTs = BigInt(Math.floor(Date.now() / 1000) + 1);
      await roomService.removeParticipant(roomName, identity, { revokeTokenTs });
    } catch (error) {
      if (
        error instanceof ServerError &&
        error.status === 404 &&
        error.code === 'not_found' &&
        error.message === 'participant does not exist'
      ) {
        continue;
      }
      throw error;
    }
  }
}

export async function verifyLiveKitWebhook(
  rawBody: string,
  authHeader?: string,
): Promise<WebhookEvent> {
  const { apiKey, apiSecret } = getLiveKitCredentials();
  const receiver = new WebhookReceiver(apiKey, apiSecret);
  return receiver.receive(rawBody, authHeader);
}

export async function deleteLiveKitRoom(roomName: string): Promise<void> {
  const livekitUrl = process.env.LIVEKIT_URL;
  if (!livekitUrl) {
    throw new Error('LIVEKIT_URL must be configured to end a LiveKit room.');
  }

  const { apiKey, apiSecret } = getLiveKitCredentials();
  try {
    await new RoomServiceClient(livekitUrl, apiKey, apiSecret).deleteRoom(roomName);
  } catch (error) {
    if (
      error instanceof ServerError &&
      error.status === 404 &&
      error.code === 'not_found' &&
      error.message === 'requested room does not exist'
    ) {
      return;
    }
    throw error;
  }
}