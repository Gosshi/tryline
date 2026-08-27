`/specs/fix-push-empty-team-slugs.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## 状況

**本番の iOS Push は一度も1通も配信されていません。**（2026-08-26 本番DB実測）

- `expo_push_tokens` は2行。**両方とも `team_slugs = []`**、`notify_prematch` / `notify_content` はどちらも `true`
- `push_notification_log` は39行、**`sum(sent_count) = 0`**、`sent_count > 0` の行は0件
- 1台は `last_used_at = 2026-08-22` で稼働中

原因は `lib/push/notifications.ts:140-155` の `getTokensForMatch` です。

```ts
.overlaps("team_slugs", teamsForMatch(match));
```

Postgres の `&&` は**空配列に対して常に false** を返します（`'{}'::text[] && '{japan,australia}'::text[]` は false）。通知トグルが true でも、`team_slugs` が空の端末は永久に抽出されません。

## 直すのは1箇所だけ

`getTokensForMatch` の抽出条件です。**空の `team_slugs` を「content 通知のみ配信」として扱います**（Owner 承認済み・2026-08-26）。

| kind | `column` 引数 | 空配列の端末 |
|---|---|---|
| prematch | `notify_prematch` | **配信しない**（現状維持） |
| preview / recap | `notify_content` | **配信する**（今回の変更） |

prematch まで配信すると、9月下旬の Premiership / URC / Top 14 開幕で**週13〜14通**になります（本番 `matches` 実測）。OS レベルで通知を切られると回復手段がありません。content 通知だけなら1日1〜2通に収まります。

## 実装方法

**`.or()` で1クエリにまとめないでください。** 配列リテラル文字列をデータから組み立てることになり、テストが Supabase クライアントをモックする以上、シリアライズの誤りを検出できません。

**通知ONの全トークンを取得してから JS で絞ってください。** 判定ロジックがそのまま単体テストの対象になります。具体的なコードは spec の「実装方針」に書いてあります。そのまま使って構いません。

件数の懸念は不要です。現在2行、ピーク時の試合数は週14件です。spec には「5,000行を超えたら再検討」と書いてありますが、**今回その対応は不要**です。

`PushTokenRow` が `token` だけを想定している場合、`team_slugs` を読むために型を足してください。`Database` 型から導出できるならそちらを優先してください。

## 触ってはいけないもの

- `app/api/v1/push/register/route.ts` の Zod validation。**空配列は引き続き登録できるようにします**
- `tryline-mobile`（別リポジトリ）。空配列になる根本原因はモバイルのチーム選択バグですが、**Owner が設問設計とセットで対応する方針**です
- Web Push（`app/api/push/send/route.ts`、`push_subscriptions`）。別テーブル・別 sender です
- `push_notification_log` のスキーマ
- `buildTitle` / `buildBody` の通知文面
- cron ルートのレスポンス形状

## 完了の定義

- spec の受け入れ条件1〜9をすべて満たす
- テストは `tests/api/ios-push-cron.test.ts` と同じモック方式に合わせる
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` がすべて通る
- 変更ファイルは `lib/push/notifications.ts` とテストのみ（型定義の追加を除く）

## PR に書いてほしいこと

修正後、`team_slugs = []` の端末が content 通知の対象に入ることを、**テストの該当ケース名を挙げて**示してください。「動くはず」ではなく、どのテストが何を保証しているかを書いてください。
