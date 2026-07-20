"use client";

import { useEffect, useState } from "react";

import { trackPushPermissionGranted } from "@/lib/analytics";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0))).buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

type NotificationSettingsProps = {
  initialTeamSlugs?: string[];
  initialSpoilerGuard?: boolean;
};

export function NotificationSettings({
  initialSpoilerGuard = false,
  initialTeamSlugs = [],
}: NotificationSettingsProps) {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [spoilerGuard, setSpoilerGuard] = useState(initialSpoilerGuard);

  async function saveSubscriptionSettings(nextSpoilerGuard: boolean) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return false;
    }

    const key = subscription.getKey("p256dh");
    const authKey = subscription.getKey("auth");

    await fetch("/api/push/subscribe", {
      body: JSON.stringify({
        auth_key: authKey ? arrayBufferToBase64(authKey) : "",
        endpoint: subscription.endpoint,
        p256dh: key ? arrayBufferToBase64(key) : "",
        spoiler_guard: nextSpoilerGuard,
        team_slugs: initialTeamSlugs,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    return true;
  }

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);

      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((status) => setSubscribed(status.state === "granted"))
      .catch(() => {});
  }, []);

  async function subscribe() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      applicationServerKey: urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
      ),
      userVisibleOnly: true,
    });
    const key = subscription.getKey("p256dh");
    const authKey = subscription.getKey("auth");

    await fetch("/api/push/subscribe", {
      body: JSON.stringify({
        auth_key: authKey ? arrayBufferToBase64(authKey) : "",
        endpoint: subscription.endpoint,
        p256dh: key ? arrayBufferToBase64(key) : "",
        spoiler_guard: spoilerGuard,
        team_slugs: initialTeamSlugs,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    setSubscribed(true);
    trackPushPermissionGranted();
  }

  async function toggleSpoilerGuard() {
    const nextValue = !spoilerGuard;
    setSpoilerGuard(nextValue);

    if (!subscribed) {
      return;
    }

    const saved = await saveSubscriptionSettings(nextValue);

    if (!saved) {
      setSubscribed(false);
    }
  }

  async function unsubscribe() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await fetch("/api/push/unsubscribe", {
        body: JSON.stringify({ endpoint: subscription.endpoint }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await subscription.unsubscribe();
    }

    setSubscribed(false);
  }

  if (!supported) {
    return (
      <p className="text-xs text-slate-500">
        このブラウザでは通知を受け取れません
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-700">レビュー公開通知</span>
        <button
          aria-label={
            subscribed ? "レビュー公開通知をオフ" : "レビュー公開通知をオン"
          }
          className={[
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
            subscribed
              ? "bg-slate-200 text-slate-700"
              : "bg-[var(--color-accent)] text-white",
          ].join(" ")}
          onClick={subscribed ? unsubscribe : subscribe}
          type="button"
        >
          {subscribed ? "オフ" : "オン"}
        </button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-700">ネタバレ防止モード</span>
        <button
          aria-label="ネタバレ防止モード"
          aria-pressed={spoilerGuard}
          className={[
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
            spoilerGuard
              ? "bg-[var(--color-accent)] text-white"
              : "bg-slate-100 text-slate-600",
          ].join(" ")}
          onClick={() => void toggleSpoilerGuard()}
          type="button"
        >
          {spoilerGuard ? "オン" : "オフ"}
        </button>
      </div>
      {!subscribed && spoilerGuard && (
        <p className="text-[11px] leading-5 text-slate-500">
          通知をオンにすると、この設定が保存されます。
        </p>
      )}
    </div>
  );
}
