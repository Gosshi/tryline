# p2-push-notifications: PWA プッシュ通知

## 背景

試合結果・コンテンツ生成完了をユーザーにリアルタイムで通知する。
DAZN 視聴前に結果を見たくないユーザー向けのネタバレ防止モードも検討する。
Web Push API（VAPID）を使用し、ネイティブアプリなしで実現する。

## スコープ

対象:
- 試合終了時のスコア通知
- recap 生成完了通知
- 通知購読管理 UI（オン/オフ・チームフィルタ）
- VAPID キー生成・管理

対象外:
- iOS Safari 旧バージョンは graceful degradation（通知不可の旨を表示）
- アプリ内通知バッジ（将来フェーズ）
- メール通知

## データモデル変更

### 新規テーブル: `push_subscriptions`

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid PK | サブスクリプション ID |
| user_id | uuid | `auth.users.id` 参照（null 可: 匿名ユーザー）|
| endpoint | text UNIQUE | Push endpoint URL |
| p256dh | text | 暗号化公開鍵 |
| auth_key | text | 認証シークレット |
| team_slugs | text[] | 通知を受け取るチーム（空 = 全試合）|
| spoiler_guard | boolean | true = スコアを隠した通知 |
| created_at | timestamptz | 作成日時 |
| last_used_at | timestamptz | 最終通知送信日時 |

RLS: 本人のみ read/update 可。insert は全員可（匿名購読対応）。

## API サーフェス

| ルート | メソッド | 役割 |
|---|---|---|
| `/api/push/subscribe` | POST | 購読登録（endpoint + keys 保存）|
| `/api/push/unsubscribe` | POST | 購読解除（endpoint で削除）|
| `/api/push/send` | POST | 内部用: 通知送信（CRON_SECRET 必須）|

### 通知ペイロード例

spoiler_guard = false:
```json
{ "title": "ENG 24–17 IRL", "body": "レビューが生成されました", "url": "/matches/uuid" }
```

spoiler_guard = true:
```json
{ "title": "Six Nations Round 3 終了", "body": "レビューが生成されました（スコア非表示）", "url": "/matches/uuid" }
```

## UI サーフェス

### 通知設定（`components/notification-settings.tsx`）

- 「通知を受け取る」トグル → Web Push 許可リクエスト
- チームフィルタ（複数選択）
- ネタバレ防止モードトグル

プロフィールページまたはヘッダードロップダウンに配置。

### Service Worker（`public/sw.js`）

- `push` イベントをリッスンしてブラウザ通知を表示
- `notificationclick` で該当試合ページを開く

## Cron 連携

`orchestrate` の recap 生成完了後に `/api/push/send` を呼ぶ。
送信対象は `push_subscriptions` のうち該当チームを含む行。

## 新規環境変数

```
VAPID_PUBLIC_KEY=xxx
VAPID_PRIVATE_KEY=xxx
VAPID_SUBJECT=mailto:admin@tryline.jp
```

## 受け入れ条件

- [ ] 「通知を受け取る」を許可するとブラウザの通知許可ダイアログが出る
- [ ] recap 生成後に購読中ユーザーに通知が届く
- [ ] spoiler_guard ユーザーにはスコアなし通知が届く
- [ ] 購読解除後は通知が届かない
- [ ] iOS Safari で設定 UI は表示され「このブラウザでは通知を受け取れません」と案内する

## 未解決の質問

- 通知タイミング: recap 生成直後 or 1日1回バッチ
- 30日以上 last_used_at が古い endpoint の自動クリーンアップをするか
- 匿名購読を許可するか（ログイン不要で通知登録できるか）
