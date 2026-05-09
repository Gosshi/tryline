# feat: レビュー生成完了プッシュ通知（Web Push / VAPID）

## 背景

recap 生成完了時にユーザーに Web Push 通知を送る。
お気に入りチームフィルタとネタバレ防止モードを持ち、`orchestrate` cron との統合で自動送信する。
`specs/p2-push-notifications.md` に対応する。MVP スコープは **recap 生成完了通知のみ**。

前提: pr29（`user_profiles.favorite_team_slugs`）がマージ済みであること。

---

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `supabase/migrations/<timestamp>_add_push_subscriptions.sql` | `push_subscriptions` テーブル新規作成 |
| `app/api/push/subscribe/route.ts` | 新規: 購読登録 |
| `app/api/push/unsubscribe/route.ts` | 新規: 購読解除 |
| `app/api/push/send/route.ts` | 新規: 通知送信（CRON_SECRET 認証） |
| `public/sw.js` | 新規: Service Worker |
| `components/notification-settings.tsx` | 新規: 通知設定 UI（Client Component）|
| `components/user-menu.tsx` | `NotificationSettings` をドロップダウンに追加 |
| `lib/cron/orchestrate.ts` | `RunOrchestrateDeps` に `sendPushNotification` 追加、recap 成功後に呼ぶ |
| `app/api/cron/orchestrate/route.ts` | `sendPushNotification` dep を注入 |
| `lib/env.ts` | `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` を追加 |

変更不可:
- `supabase/migrations/` 既存ファイル
- `lib/cron/auth.ts`

---

## 変更内容

### 1. マイグレーション

タイムスタンプは既存の最大値 + 1。

```sql
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  team_slugs text[] not null default '{}',
  spoiler_guard boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table push_subscriptions enable row level security;

create policy "own subscription" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "insert subscription" on push_subscriptions
  for insert with check (true);
```

---

### 2. 環境変数

`lib/env.ts` の `getServerEnv` に以下を追加する（`string` 必須として扱う）:

```
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
```

ブラウザから参照するため `NEXT_PUBLIC_VAPID_PUBLIC_KEY` も追加する（`getServerEnv` ではなく `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` で参照）。

VAPID キーペアの生成コマンド（Codex はコードに埋め込まない。Owner が実行して Vercel と `.env.local` に設定する）:

```bash
npx web-push generate-vapid-keys
```

---

### 3. `pnpm add web-push && pnpm add -D @types/web-push`

`web-push` パッケージを追加する。Codex が `package.json` に追記し `pnpm install` を実行する。

---

### 4. `app/api/push/subscribe/route.ts`（新規）

```typescript
import { NextResponse } from "next/server";

import { getSupabaseServerClientWithAuth, getUser } from "@/lib/auth/server";

export async function POST(request: Request) {
  const user = await getUser();
  const body: unknown = await request.json();

  if (
    !body ||
    typeof body !== "object" ||
    !("endpoint" in body) ||
    !("p256dh" in body) ||
    !("auth_key" in body)
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { auth_key, endpoint, p256dh, spoiler_guard, team_slugs } = body as {
    auth_key: string;
    endpoint: string;
    p256dh: string;
    spoiler_guard?: boolean;
    team_slugs?: string[];
  };

  const db = await getSupabaseServerClientWithAuth();
  const { error } = await db.from("push_subscriptions").upsert(
    {
      auth_key,
      endpoint,
      p256dh,
      spoiler_guard: spoiler_guard ?? false,
      team_slugs: team_slugs ?? [],
      user_id: user?.id ?? null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

---

### 5. `app/api/push/unsubscribe/route.ts`（新規）

```typescript
import { NextResponse } from "next/server";

import { getSupabaseServerClientWithAuth } from "@/lib/auth/server";

export async function POST(request: Request) {
  const body: unknown = await request.json();

  if (!body || typeof body !== "object" || !("endpoint" in body)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { endpoint } = body as { endpoint: string };
  const db = await getSupabaseServerClientWithAuth();
  const { error } = await db
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

---

### 6. `app/api/push/send/route.ts`（新規）

CRON_SECRET 認証が必要な内部 API。`orchestrate` cron からのみ呼ぶ。

```typescript
import { NextResponse } from "next/server";
import webpush from "web-push";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    throw error;
  }

  const { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } = getServerEnv();

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const body: unknown = await request.json();

  if (
    !body ||
    typeof body !== "object" ||
    !("matchId" in body) ||
    !("homeTeamSlug" in body) ||
    !("awayTeamSlug" in body) ||
    !("homeScore" in body) ||
    !("awayScore" in body) ||
    !("homeTeamName" in body) ||
    !("awayTeamName" in body)
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { awayScore, awayTeamName, awayTeamSlug, homeScore, homeTeamName, homeTeamSlug, matchId } =
    body as {
      awayScore: number;
      awayTeamName: string;
      awayTeamSlug: string;
      homeScore: number;
      homeTeamName: string;
      homeTeamSlug: string;
      matchId: string;
    };

  const db = getSupabaseServerClient();
  const { data: subscriptions, error } = await db
    .from("push_subscriptions")
    .select("auth_key, endpoint, p256dh, spoiler_guard, team_slugs");

  if (error) {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  const matchUrl = `/matches/${matchId}`;
  let sent = 0;

  for (const sub of subscriptions ?? []) {
    // team_slugs が空 = 全試合通知。非空なら該当チームのみ
    const teamMatch =
      sub.team_slugs.length === 0 ||
      sub.team_slugs.includes(homeTeamSlug) ||
      sub.team_slugs.includes(awayTeamSlug);

    if (!teamMatch) {
      continue;
    }

    const title = sub.spoiler_guard
      ? "試合終了"
      : `${homeTeamName} ${homeScore}–${awayScore} ${awayTeamName}`;

    const payload = JSON.stringify({
      body: "レビューが生成されました",
      title,
      url: matchUrl,
    });

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { auth: sub.auth_key, p256dh: sub.p256dh },
        },
        payload,
      );
      sent += 1;
    } catch {
      // 期限切れ endpoint（410 Gone 等）は無視する
    }
  }

  return NextResponse.json({ sent });
}
```

---

### 7. `public/sw.js`（新規）

```javascript
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Tryline", {
      body: data.body ?? "",
      data: { url: data.url ?? "/" },
      icon: "/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(clients.openWindow(url));
});
```

---

### 8. `components/notification-settings.tsx`（新規）

```typescript
"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

interface NotificationSettingsProps {
  initialTeamSlugs?: string[];
}

export function NotificationSettings({ initialTeamSlugs = [] }: NotificationSettingsProps) {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);

      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
    navigator.permissions
      .query({ name: "notifications" })
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
        auth_key: authKey
          ? btoa(String.fromCharCode(...new Uint8Array(authKey)))
          : "",
        endpoint: subscription.endpoint,
        p256dh: key
          ? btoa(String.fromCharCode(...new Uint8Array(key)))
          : "",
        team_slugs: initialTeamSlugs,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    setSubscribed(true);
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
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-700">recap 通知</span>
      <button
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
  );
}
```

---

### 9. `components/user-menu.tsx` の変更

`NotificationSettings` をドロップダウン内に追加する（`UserMenuProps` に `favoriteTeamSlugs` が pr29 で追加済みの前提）:

```tsx
import { NotificationSettings } from "@/components/notification-settings";

// ドロップダウン内、チームピッカーセクションの下
<div className="border-t border-slate-100 px-4 py-2">
  <NotificationSettings initialTeamSlugs={favoriteTeamSlugs} />
</div>
```

---

### 10. `lib/cron/orchestrate.ts` の変更

#### 10a. 型追加

```typescript
export type PushMatchInfo = {
  awayScore: number;
  awayTeamName: string;
  awayTeamSlug: string;
  homeScore: number;
  homeTeamName: string;
  homeTeamSlug: string;
  matchId: string;
};

export type RunOrchestrateDeps = {
  // ...既存フィールド...
  sendPushNotification?: (info: PushMatchInfo) => Promise<void>;  // 追加（省略可）
};
```

#### 10b. recap ループ内での呼び出し

`await deps.generateContent(matchId, "recap")` 成功後に挿入する:

```typescript
if (deps.sendPushNotification) {
  try {
    const { data: match } = await deps.db
      .from("matches")
      .select(
        `
          id, home_score, away_score,
          home_team:teams!matches_home_team_id_fkey (slug, name),
          away_team:teams!matches_away_team_id_fkey (slug, name)
        `,
      )
      .eq("id", matchId)
      .single();

    if (
      match?.home_score !== null &&
      match?.away_score !== null &&
      match?.home_team &&
      match?.away_team
    ) {
      await deps.sendPushNotification({
        awayScore: match.away_score,
        awayTeamName: match.away_team.name,
        awayTeamSlug: match.away_team.slug,
        homeScore: match.home_score,
        homeTeamName: match.home_team.name,
        homeTeamSlug: match.home_team.slug,
        matchId,
      });
    }
  } catch (pushError) {
    console.warn("[orchestrate] push notification failed", { matchId, pushError });
  }
}
```

---

### 11. `app/api/cron/orchestrate/route.ts` の変更

```typescript
import type { PushMatchInfo } from "@/lib/cron/orchestrate";

async function sendPushNotification(info: PushMatchInfo): Promise<void> {
  const { CRON_SECRET } = getServerEnv();
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const response = await fetch(`${baseUrl}/api/push/send`, {
    body: JSON.stringify(info),
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`push/send failed: ${response.status}`);
  }
}

// runOrchestrate 呼び出しに sendPushNotification を追加
const result = await runOrchestrate({
  db: getSupabaseServerClient(),
  generateContent: generateMatchContent,
  ingestLineups,
  sendPushNotification,
});
```

---

## 実装上の注意

- `web-push` パッケージを `pnpm add web-push && pnpm add -D @types/web-push` でインストールすること
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` はブラウザ側で参照するため `NEXT_PUBLIC_` プレフィックスが必要
- `sendPushNotification` を `RunOrchestrateDeps` のオプショナルプロパティ（`?`）にすることで、既存テストへの影響なし
- 期限切れ endpoint（`410 Gone`）の自動削除は本 PR のスコープ外。`webpush.sendNotification` が throw するエラーは try/catch でスキップする
- iOS Safari 旧バージョンでは Push API が未対応。`"serviceWorker" in navigator && "PushManager" in window` チェックで graceful degradation する

---

## 完了条件

- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
- [ ] `push_subscriptions` テーブルがマイグレーションで作成される
- [ ] 「recap 通知 オン」をクリックするとブラウザの通知許可ダイアログが出る
- [ ] 購読登録後に `push_subscriptions` にレコードが挿入される
- [ ] recap 生成完了後に購読中ユーザーに通知が届く
- [ ] `spoiler_guard = true` のユーザーには「試合終了」（スコアなし）通知が届く
- [ ] `team_slugs` が空のユーザーは全試合の通知を受け取る
- [ ] iOS Safari では「このブラウザでは通知を受け取れません」と表示される

---

## 参照ファイル

| ファイル | 参照目的 |
|---------|---------|
| `specs/p2-push-notifications.md` | 仕様の全体像 |
| `lib/cron/orchestrate.ts` | 変更対象（recap 生成ループ・`RunOrchestrateDeps` 型）|
| `app/api/cron/orchestrate/route.ts` | dep 注入パターンの現状 |
| `lib/cron/auth.ts` | `assertCronAuthorized`・`CronUnauthorizedError` の実装 |
| `lib/auth/server.ts` | `getUser`・`getSupabaseServerClientWithAuth` の実装 |
| `lib/env.ts` | `getServerEnv` の実装（環境変数追加先）|
| `components/user-menu.tsx` | ドロップダウンへの組み込み先 |
