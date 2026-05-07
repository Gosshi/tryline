# p2-premium-access-control: コンテンツ制限と AI チャット流量制御

## 背景

Premium 課金フローが動いたため、Free/Premium のコンテンツ差別化と
AI チャットのコスト上限を実装する。

2 つの独立した機能をこの仕様書にまとめる。

---

## 機能 A: recap/preview 全文 paywall

### 概要

Free ユーザーが試合詳細ページを訪れると、recap・preview の本文が
冒頭 300 字でフェードアウトし、Premium への誘導 CTA を表示する。
Premium ユーザーは全文を閲覧できる。

### スコープ

対象:
- `app/matches/[id]/page.tsx` → `MatchContentSection` への `isPremium` 受け渡し
- `components/match-content-section.tsx` → `MatchContent` への `isPremium` 受け渡し
- `components/match-content.tsx` → 300 字 truncation + fade + CTA

対象外:
- AI チャット（すでに実装済み）
- スコア・順位表・イベント・ラインアップ（Free でも全表示）

### UI 仕様

**Free ユーザー:**
1. 本文の冒頭 300 字を表示
2. 末尾に下から白へのグラデーションをかける（`from-transparent to-white`）
3. グラデーションの下に「続きを読む」CTA を表示:
   - コピー: 「続きは Premium でご覧いただけます」
   - ボタン: 「Premium を始める - ¥980/月」→ `/pricing` へリンク
4. 目次（TOC）は非表示にする（全文なしでは意味がないため）

**Premium ユーザー:**
- 現在と同じ全文表示（変更なし）

### データフロー

```
MatchDetailPage (app/matches/[id]/page.tsx)
  isPremium (既存) ─→ MatchContentSection (props 追加)
                          └─→ MatchContent (props 追加)
                                └─→ truncate / fade / CTA
```

### 変更するファイル

- `app/matches/[id]/page.tsx` — `isPremium` を `MatchContentSection` に渡す
- `components/match-content-section.tsx` — `isPremium` prop 追加・`MatchContent` に渡す
- `components/match-content.tsx` — `isPremium` prop 追加・Free 時は 300 字 truncate + fade + CTA

### 変更しないファイル

- `components/paywall.tsx`（AI チャット用のまま。コンテンツ truncation は `MatchContent` 内で実装）
- `lib/auth/server.ts`

---

## 機能 B: AI チャット 1 日あたりメッセージ上限

### 概要

Premium ユーザーが 1 日に送信できるメッセージ数を上限 30 件とする。
上限に達した場合は API から 429 を返し、UI にメッセージを表示する。
翌日 UTC 0:00 にリセットする。

### コスト根拠

gpt-4o-mini で 1 メッセージあたり平均 800 tokens（入力込み）と想定:
- 30 件/日 × 800 tokens = 24,000 tokens/日
- $0.014/日 ≈ $0.43/月/ユーザー
- 100 ユーザーで $43/月 ← ¥98,000 収益に対し許容範囲

### データモデル変更

`user_profiles` テーブルにカラムを追加:

| カラム | 型 | デフォルト | 説明 |
|---|---|---|---|
| `chat_daily_count` | `int` | `0` | 当日の送信メッセージ数 |
| `chat_daily_reset_date` | `date` | `current_date` | カウントが最後にリセットされた日（UTC） |

マイグレーション:
```sql
alter table user_profiles
  add column if not exists chat_daily_count int not null default 0,
  add column if not exists chat_daily_reset_date date not null default current_date;
```

### API 変更（`app/api/chat/[matchId]/route.ts`）

メッセージ受信時のフロー:

1. `user_profiles` から `chat_daily_count` と `chat_daily_reset_date` を取得
2. `chat_daily_reset_date < today（UTC）` なら `chat_daily_count = 0`、`chat_daily_reset_date = today` に更新
3. `chat_daily_count >= 30` なら `429` + `{ error: "daily_limit_exceeded" }` を返す
4. 処理後に `chat_daily_count += 1`、`updated_at = now()` を更新

定数: `const DAILY_MESSAGE_LIMIT = 30`

### UI 変更（`components/match-chat.tsx`）

`daily_limit_exceeded` エラーを受信した場合の表示:
```
1 日のメッセージ上限（30 件）に達しました。明日またご利用ください。
```

### 変更するファイル

- `supabase/migrations/YYYYMMDDHHMMSS_add_chat_rate_limit.sql`（新規マイグレーション）
- `app/api/chat/[matchId]/route.ts`（daily limit チェック + インクリメント）
- `components/match-chat.tsx`（`daily_limit_exceeded` エラーメッセージ追加）

---

## 受け入れ条件

### 機能 A

- [ ] Free ユーザーが試合ページを開くと recap/preview が 300 字で切れてフェードアウトする
- [ ] フェードアウトの下に「Premium を始める」CTA が表示される
- [ ] Premium ユーザーは全文を読める
- [ ] ログアウト状態でも 300 字制限が適用される

### 機能 B

- [ ] Premium ユーザーが 30 件メッセージを送ると 31 件目でエラーメッセージが表示される
- [ ] 翌日（UTC）に送信するとカウントがリセットされて再度使用できる
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- 上限を日次ではなく月次にすべきか（例: 300 件/月）
- リセットを UTC 基準ではなく JST 基準にすべきか
