import webpush, { type PushSubscription as WebPushSubscription } from "web-push";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
const subject = process.env.VAPID_SUBJECT ?? "mailto:alerts@clearanceiq.app";

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendPushNotification(
  sub: StoredSubscription,
  payload: PushPayload
): Promise<{ ok: boolean; error?: string }> {
  if (!publicKey || !privateKey) {
    return { ok: false, error: "VAPID keys not configured" };
  }
  const subscription: WebPushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };
  const body: PushPayload = {
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    ...payload,
  };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(body));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
