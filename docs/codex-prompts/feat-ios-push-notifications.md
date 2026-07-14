# Codex プロンプト: feat-ios-push-notifications

2 リポジトリ構成。**プロンプト A（tryline）→ マージ・マイグレーション適用 → プロンプト B（tryline-mobile）** の順で貼る。

## Owner の事前作業（プロンプト B の前に）

```bash
cd ~/Documents/src/tryline-mobile
npx eas-cli init   # projectId を app.config.ts に追記（ビルド枠は消費しない）。変更をコミット
```

---

## プロンプト A（tryline リポジトリで貼る）

`/specs/feat-ios-push-notifications.md` の「tryline 側」を実装してください: `expo_push_tokens` / `push_notification_log` テーブル、`POST /api/v1/push/register` / `unregister`、通知送信 cron 2 本＋workflow。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- Bearer 任意認証は `lib/auth/bearer.ts` の `getUserFromBearer`、エンベロープは `lib/api/v1/response.ts`、service role 書き込みは `app/api/v1/me/route.ts` の DELETE、cron 認証は `lib/cron/auth.ts` の `assertCronAuthorized`、workflow は `.github/workflows/cron-ingest-standings.yml` のパターンを参照
- 新規依存 `expo-server-sdk` の追加を許可する（仕様書に明記済み）
- **既存 Web Push（`app/api/push/*`・`push_subscriptions`）には触らない**

入出力の具体例:
- register: `POST /api/v1/push/register` body `{ "token": "ExponentPushToken[abc123]", "team_slugs": ["japan", "france"], "notify_prematch": true, "notify_content": true, "spoiler_guard": true }` → 200 `{ success: true, data: { registered: true }, error: null }`。同じ token で再送 → 行数は増えず内容が更新される
- prematch 通知: title「まもなくキックオフ」body「日本 v フランス（ネーションズチャンピオンシップ）7/18 21:40」data `{ matchId, url }`

エッジケース:
- token が `ExponentPushToken[` 形式でない / team_slugs が 11 件以上 / 配列でない → 400
- 同一実行内に対象試合が複数 → 試合ごとに log 1 行、トークンは試合ごとに交差判定
- Expo API が `DeviceNotRegistered` → 該当 token を削除しログに件数を出す
- Expo API 呼び出し自体の失敗 → その試合の log は書かず次回リトライ（重複送信より未送信リトライを優先）
- キックオフ時刻が null の試合 → prematch 対象外
- マイグレーションで両テーブルに `revoke all ... from anon, authenticated` を必ず含める（entitlement 事故の教訓、仕様書「権限」参照）

完了の定義: 受け入れ条件 1〜10 のテスト追加（Expo 送信はモック）、`pnpm test`・`pnpm build` pass。**マイグレーションの本番適用は Owner が行う**。仕様書との食い違いは停止して Owner に確認。

---

## プロンプト B（tryline-mobile リポジトリで貼る。A のマージ・本番適用後）

`docs/specs/feat-ios-push-notifications.md`（このリポジトリにコピー設置済み）の「tryline-mobile 側」を実装してください。サーバー側（register API・送信 cron）は実装・本番稼働済みです。

コンテキスト:
- `AGENTS.md` を読む。仕様書は `docs/specs/feat-ios-push-notifications.md`
- 新規依存 `expo-notifications` の追加を許可する
- 通知タップ遷移先はアプリ本体 spec で固定済みの `matches/[id]`
- 設定画面・SettingsProvider・favorites の既存実装に通知トグルと register 同期を統合する

エッジケース:
- OS 通知許可が拒否済み → トグル OFF 表示＋`Linking.openSettings()` への案内。register は送らない
- projectId 未設定（`eas init` 前）→ token 取得に失敗してもクラッシュせず、設定画面にその旨を表示
- 未ログインで通知 ON → team_slugs 空配列で register（UI に「お気に入りチームを設定すると通知されます」）
- killed 状態からの通知タップ起動（`getLastNotificationResponseAsync`）
- register / unregister の API 失敗 → トグル状態をロールバックして日本語エラー表示

完了の定義:
- 受け入れ条件 11〜15 のテスト追加、CI green
- 受け入れ条件 16（Owner 実機確認）の手順を PR 説明に記載（`npx expo run:ios`、Expo push tool でのテスト送信方法を含む）
- 実装内容・変更ファイルの要約、仕様書からの逸脱（あれば理由）、未解決の質問を報告する

---

## 委譲後の流れ（Owner 向けメモ）

1. プロンプト A → tryline に PR → `codex-review` → マージ → **Owner がマイグレーション適用**（`supabase db push --linked`）→ デプロイ確認
2. GitHub Secrets に変更なし（CRON_SECRET は既存）。workflow はマージで自動有効化
3. `npx eas-cli init` → プロンプト B → tryline-mobile に PR → `codex-review` → Owner 実機確認（`npx expo run:ios`）→ マージ
4. 次: App Store Connect 登録・ASO 素材（アプリ名・スクショ・説明文）の準備
