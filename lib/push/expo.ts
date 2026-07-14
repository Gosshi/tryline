import { Expo } from "expo-server-sdk";

import type { ExpoPushMessage } from "expo-server-sdk";

export type PushMessage = {
  body: string;
  data: {
    matchId: string;
    url: string;
  };
  title: string;
  to: string;
};

export type ExpoSendResult = {
  deviceNotRegisteredTokens: string[];
  sentCount: number;
};

export async function sendExpoPushNotifications(
  messages: PushMessage[],
): Promise<ExpoSendResult> {
  if (messages.length === 0) {
    return { deviceNotRegisteredTokens: [], sentCount: 0 };
  }

  const expo = new Expo();
  const chunks = expo.chunkPushNotifications(
    messages.map(
      (message): ExpoPushMessage => ({
        to: message.to,
        sound: "default",
        title: message.title,
        body: message.body,
        data: message.data,
      }),
    ),
  );
  const deviceNotRegisteredTokens = new Set<string>();

  for (const chunk of chunks) {
    const tickets = await expo.sendPushNotificationsAsync(chunk);

    tickets.forEach((ticket, index) => {
      const token = chunk[index]?.to;

      if (
        ticket.status === "error" &&
        ticket.details?.error === "DeviceNotRegistered" &&
        typeof token === "string"
      ) {
        deviceNotRegisteredTokens.add(token);
      }
    });
  }

  return {
    deviceNotRegisteredTokens: [...deviceNotRegisteredTokens],
    sentCount: messages.length,
  };
}
