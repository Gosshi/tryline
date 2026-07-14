# feat-ios-push-notifications: iOS アプリの push 通知 v1

## 背景

D014 の v1 スコープのうち、アプリ本体（tryline-mobile PR #1、マージ済み）に含めなかった push 通知を実装する。目的は「試合前に視聴を促す」「記事公開を知らせて再訪させる」の 2 つ。

- **Expo Push Service を採用**する。APNs 鍵の管理・配送を Expo に委譲し、アプリは `expo-notifications` で ExpoPushToken を取得、サーバーは Expo の push API へ送るだけにする（APNs 直接統合は将来必要になったときに差し替え可能）
- 既存の Web Push（`specs/p2-push-notifications.md`、`push_subscriptions` テーブル）とは**別チャネル・別テーブル**。spoiler_guard・team_slugs の設計思想は継承する
- 通知タップからの遷移はアプリ直起動＋データペイロードで行うため、**Universal Links / AASA は不要**（本 spec のスコープから除外し、Web→アプリ誘導が必要になった時点で別 spec）

**テスト環境の制約（重要）**: Expo Go は SDK 53 以降リモート push 非対応。動作確認は `npx expo run:ios`（ローカル Xcode ビルド、**EAS ビルド枠を消費しない**）で行う。ExpoPushToken の取得には EAS projectId が必要だが、`eas init`（プロジェクト作成のみ）はビルド枠を消費しない（Owner 作業）。

対象リポジトリは 2 つ:
- **tryline**: トークン登録 API・通知送信 cron・データモデル
- **tryline-mobile**: expo-notifications 導入・許可 UX・設定 UI・タップ遷移

## スコープ

対象（tryline）:
- テーブル `expo_push_tokens` / `push_notification_log`
- API: `POST /api/v1/push/register` / `POST /api/v1/push/unregister`
- 送信ユーティリティ（expo-server-sdk、新規依存）
- cron 2 本: 試合前通知（毎時）/ 記事公開通知（30 分毎）＋対応する GitHub Actions workflow

対象（tryline-mobile）:
- `expo-notifications` 導入（新規依存）と ExpoPushToken 取得
- 通知許可の文脈的プロンプト（お気に入り初回保存後 or 設定トグル ON 時）
- 設定画面: 試合前通知 / 記事公開通知のトグル
- お気に入り・設定変更時のトークン再登録（サーバーとの同期）
- 通知タップ → `matches/[id]` へ遷移

対象外:
- Web Push（`app/api/push/*`）の変更
- Universal Links / AASA
- Live Activities / ウィジェット
- 通知文言のスコア出し分け（v1 は**全通知スコアレス**に統一。下記）
- 通知時刻のユーザーカスタマイズ（リード時間は固定）
- Android

## データモデル変更

### 新規テーブル: `expo_push_tokens`

```sql
create table expo_push_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  team_slugs text[] not null default '{}',
  notify_prematch boolean not null default true,
  notify_content boolean not null default true,
  spoiler_guard boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);
```

- `user_id` は null 可（未ログインデバイスも通知を受けられる）
- `spoiler_guard` は将来の文言出し分け用に保存するが、v1 の送信文言は分岐しない

### 新規テーブル: `push_notification_log`

```sql
create table push_notification_log (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  kind text not null check (kind in ('prematch', 'preview', 'recap')),
  sent_count integer not null default 0,
  sent_at timestamptz not null default now(),
  unique (match_id, kind)
);
```

- 送信は試合×種別で全デバイスへ一括ファンアウトするため、重複防止ログは試合×種別の 1 行で足りる

### 権限（entitlement 事故の教訓を最初から適用）

両テーブルとも RLS を有効化し、**クライアントロールのポリシー・grant を一切付与しない**（`revoke all on <table> from anon, authenticated;`）。読み書きは API ルート・cron の service role のみ。`feat-premium-entitlement-refactor` で修正した「デフォルト grant による自己書き換え穴」をこのテーブルでは最初から塞ぐ。

## API サーフェス

### `POST /api/v1/push/register`

- 認証**任意**（Bearer があれば `user_id` を紐付け、なければ null）
- ボディ: `{ token, team_slugs, notify_prematch, notify_content, spoiler_guard }`
- バリデーション: `token` は `ExponentPushToken[` で始まる文字列、`team_slugs` は文字列配列・最大 10 件、bool 3 つは省略時 true。違反は 400
- `token` で upsert（設定変更・お気に入り変更のたびにアプリが再送する = 同期手段）
- 書き込みは service role クライアント（クライアント直書き禁止。パターンは `app/api/v1/me/route.ts` の DELETE 参照）
- 共通エンベロープ（`lib/api/v1/response.ts`）、`Cache-Control: private, no-store`

### `POST /api/v1/push/unregister`

- ボディ: `{ token }` → 該当行を削除。存在しない token でも 200（冪等）

### cron: `GET /api/cron/send-prematch-notifications`（毎時）

- 認証: `assertCronAuthorized`（`lib/cron/auth.ts`）
- 対象試合: キックオフが now+30 分〜now+90 分の窓にあり、`push_notification_log` に (match_id, 'prematch') が存在しないもの（試合取得は `lib/db/queries/matches.ts` の既存関数を再利用。`getMatchesInRange` / `getNextMatchesForTeams` を確認して適切な方を使う）
- 対象トークン: `notify_prematch = true` かつ `team_slugs` が試合のどちらかのチームと交差する行（`team_slugs = '{}'` の行は対象外）
- 通知内容: title 例「まもなくキックオフ」、body 例「日本 v フランス（ネーションズチャンピオンシップ）7/18 21:40」。**スコア・勝敗情報を含まない**。data: `{ "matchId": "<uuid>", "url": "/matches/<uuid>" }`
- 送信後 `push_notification_log` に挿入（`sent_count` = 送信対象トークン数）

### cron: `GET /api/cron/send-content-notifications`（30 分毎）

- 対象: 直近 24 時間に `status = 'published'` になった preview / recap（`match_content` の `generated_at` 基準）で、log に (match_id, kind) が無いもの
- 対象トークン: `notify_content = true` かつ team_slugs が交差する行
- 通知内容（**v1 は全員スコアレス**。ネタバレ事故をゼロ保証にするため、spoiler_guard の値によらず本文にスコア・勝敗を入れない）:
  - preview: 「プレビュー公開: 日本 v フランス」
  - recap: 「試合レビュー公開: 日本 v フランス（スコアは開いてから）」
- data は prematch と同形式

### 送信ユーティリティ（tryline 側 `lib/push/`）

- `expo-server-sdk`（新規依存。仕様書で明示的に許可）でチャンク送信
- Expo からの `DeviceNotRegistered` エラーを受けた token は `expo_push_tokens` から削除する（silent に握り潰さず、削除件数をログに出す）
- 送信失敗（ネットワーク等）は cron のレスポンスに件数を含め、log には**成功した試合のみ**記録する（失敗分は次回リトライされる）

### GitHub Actions workflow

- `.github/workflows/cron-send-prematch-notifications.yml`（毎時）/ `cron-send-content-notifications.yml`（30 分毎）。既存の `cron-ingest-standings.yml` のパターン（CRON_SECRET を Bearer で送る）に従う

## UI サーフェス（tryline-mobile）

### 通知許可のタイミング（文脈的プロンプト）

- 起動直後に OS の許可ダイアログを出さない
- トリガーは 2 つ: (a) お気に入りチームを初めて保存した直後に「お気に入りチームの試合前に通知しますか？」という自前の説明 UI → OK なら OS ダイアログ、(b) 設定画面の通知トグルを ON にしたとき
- OS 許可が拒否されている場合、トグルは OFF 表示＋「設定アプリから通知を許可してください」の案内（`Linking.openSettings()`）

### 設定画面への追加

- 「試合前通知」「記事公開通知」トグル（既存のネタバレ防止トグルの近くに配置）
- どちらかが ON かつ OS 許可ありのとき token を取得し `/api/v1/push/register` へ送信。両方 OFF にしたら `/api/v1/push/unregister`
- 送信する `team_slugs`: ログイン時はサーバーのお気に入り、未ログイン時は空配列（= v1 では未ログインは実質通知対象外。お気に入りがログイン必須のため。UI 上は「お気に入りチームを設定すると通知されます」と案内）
- `spoiler_guard` は既存のネタバレ防止設定値を送る

### 同期

- お気に入り変更・通知トグル変更・ネタバレ防止変更のたびに register を再送（upsert なので冪等）
- ログイン / ログアウト時も再送（user_id の付け外し）

### 通知タップ

- `expo-notifications` の response listener で `data.matchId` を読み、`router.push("/matches/<id>")`（アプリ本体 spec で固定したルート）
- アプリ killed 状態からの起動（`getLastNotificationResponseAsync`）もハンドリングする

## LLM 連携

なし。通知文言はテンプレート＋DB の実データ（チーム名・大会名・キックオフ時刻）のみで組み立てる。LLM による文言生成は行わない（捏造リスクをゼロにする）。

## 受け入れ条件

### tryline 側

1. `POST /api/v1/push/register`: 正しいボディで 200・upsert される（同一 token の 2 回目で行が増えない）。`ExponentPushToken[` で始まらない token / 11 件以上の team_slugs は 400。Bearer 付きなら `user_id` が入る
2. `POST /api/v1/push/unregister`: 該当行が消える。未知の token でも 200
3. `expo_push_tokens` / `push_notification_log` に対し、authenticated ロールのクライアントから SELECT / INSERT / UPDATE / DELETE がすべて拒否される（テストで検証）
4. prematch cron: KO 60 分前の試合＋合致トークンがある状態で実行すると Expo API（モック）に該当トークン分の送信が行われ、log に 1 行入る。**直後にもう一度実行すると送信 0 件**
5. prematch cron: `team_slugs` が交差しないトークン・`notify_prematch = false` のトークンには送信されない
6. content cron: published な recap＋合致トークンで送信され、preview と recap は別 log で管理される。再実行で重複送信されない
7. 通知の title / body に数字のスコアが含まれないことをテストで検証（prematch / preview / recap 全種別）
8. Expo モックが `DeviceNotRegistered` を返した token が削除される
9. cron ルートは `assertCronAuthorized` を通らないリクエストに 401
10. workflow 2 本が追加され、`pnpm test`・`pnpm build` が pass

### tryline-mobile 側

11. 通知トグル ON（OS 許可あり）で `/api/v1/push/register` に正しいペイロードが送られる（API クライアントの単体テスト）。両方 OFF で unregister が送られる
12. お気に入り変更後に register が再送される
13. 通知タップの response データ `{ matchId }` から `matches/[id]` への遷移が呼ばれる(単体テスト)
14. 起動直後に OS 許可ダイアログが出ない（許可リクエストはトリガー操作時のみ）
15. TypeScript strict・CI green
16. **Owner 実機確認**: `npx expo run:ios` の開発ビルド（EAS 枠不使用）を実機に入れ、テスト通知（Expo push tool または cron の手動実行）を 1 件受信し、タップで該当試合詳細が開くところまで確認する

## 未解決の質問

1. **試合前通知のリード時間**: 60 分前（30〜90 分窓）を仮とする。Owner が変更したい場合は実装前に指定
2. **EAS projectId**: ExpoPushToken 取得に必要。Owner が `npx eas-cli init` を実行（ビルド枠は消費しない）し、生成された projectId 入りの `app.config.ts` 変更をコミットする — プロンプト B 着手前の事前作業
3. **通知許可プロンプトの文言**: 自前説明 UI のコピーは実装時に Codex が仮置きし、Owner 目視で調整
