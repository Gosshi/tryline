# 空の team_slugs が iOS Push を無音で0通にしている

## 背景

**本番の iOS Push は、一度も1通も配信されていない。**（2026-08-26 実測）

| テーブル | 実測 |
|---|---|
| `expo_push_tokens` | 2 行。**両方とも `team_slugs = []`**、`notify_prematch = true`、`notify_content = true` |
| `push_notification_log` | 39 行、**`sum(sent_count) = 0`**、`sent_count > 0` の行は **0 件** |

登録2台のうち1台は `last_used_at = 2026-08-22` で稼働中。ユーザーは通知を明示的にONにしているのに、39回の送信処理すべてが0通で終わっている。

### 原因

`lib/push/notifications.ts:140-155` の `getTokensForMatch`:

```ts
const { data, error } = await client
  .from("expo_push_tokens")
  .select("token")
  .eq(column, true)
  .overlaps("team_slugs", teamsForMatch(match));
```

`overlaps`（Postgres `&&`）は**空配列に対して常に false** を返す。`'{}'::text[] && '{japan,australia}'::text[]` は false。したがって `team_slugs = []` の端末は、通知トグルが true でも永久に抽出されない。

`app/api/v1/push/register/route.ts` の Zod validation は空配列を許可しているため、登録は成功する。**登録は通る／配信は絶対に来ない**という組み合わせになっている。

### なぜ空配列になっているか（本 spec の対象外）

モバイル側のチーム選択候補ロジックが実質0件になる既知バグ（`onboarding.tsx` / `FavoritesEditor.tsx` が先頭8大会の standings を参照し、それらが空）が有力。**これは別リポジトリ `tryline-mobile` の課題であり、Owner が設問設計とセットで対応する。本 spec では触らない。**

本 spec が直すのは、**サーバー側が「関心表明の無い端末」を無音で切り捨てている**点だけである。モバイルが直っても直らなくても、サーバーは安全側に倒れるべきである。

## スコープ

対象:
- `lib/push/notifications.ts` の `getTokensForMatch` の抽出条件
- 対応するテスト

対象外:
- `tryline-mobile` のチーム選択・お気に入り同期（別リポジトリ、Owner 対応）
- `app/api/v1/push/register/route.ts` の validation（空配列は引き続き許可する）
- Web Push（`push_subscriptions`）。別テーブル・別 sender であり本 spec は一切触らない
- `sendForMatch` が対象0件でも `push_notification_log` に行を作る挙動（`lib/push/notifications.ts:203`）。可観測性の課題だが本 spec の変更対象外
- 通知の文面（`buildTitle` / `buildBody`）

## 決定事項（Owner 承認済み・2026-08-26）

**空の `team_slugs` は「特定チームへの関心表明が無い」と解釈し、content 通知のみ配信する。prematch は配信しない。**

| kind | 呼び出し時の `column` | 空配列の端末 |
|---|---|---|
| prematch | `notify_prematch` | **配信しない**（現状維持） |
| preview / recap | `notify_content` | **配信する**（今回の変更） |

根拠は通知量。試合数は8月が週1〜3件だが、**9月下旬の Premiership / URC / Top 14 開幕で週13〜14件に跳ね上がる**（本番 `matches` 実測）。

| 週 | 試合数 | 空配列を全チーム扱いにした場合の prematch 通知 |
|---|---:|---:|
| 2026-08-24 | 2 | 2 |
| 2026-09-21 | 13 | 13 |
| 2026-10-19 | 14 | 14 |
| 2026-11-02 | 6 | 6 |

prematch まで配信すると開幕週に1日4通となり、OS レベルで通知を切られる。切られた場合の回復手段は無い。content 通知（preview / recap 公開）だけなら1日1〜2通に収まる。

## データモデル変更

**なし。** マイグレーション不要。既存の `expo_push_tokens.team_slugs` の解釈だけを変える。

## API サーフェス

**なし。** 公開 API の入出力は変わらない。cron の JSON レスポンス形状も変えない。

## 実装方針

`getTokensForMatch` を、**DB 側の `overlaps` に頼らず、取得後に JS で判定する**形に変える。

```ts
async function getTokensForMatch(
  client: SupabaseClient<Database>,
  match: PushMatch,
  column: "notify_content" | "notify_prematch",
) {
  const { data, error } = await client
    .from("expo_push_tokens")
    .select("token, team_slugs")
    .eq(column, true);

  if (error) {
    throw error;
  }

  const matchTeams = teamsForMatch(match);

  return (data ?? []).filter((row) => {
    const slugs = row.team_slugs ?? [];

    // 関心表明が無い端末は content のみ対象にする
    if (slugs.length === 0) {
      return column === "notify_content";
    }

    return matchTeams.some((slug) => slugs.includes(slug));
  }) as PushTokenRow[];
}
```

### なぜ PostgREST の `.or()` を使わないか

「overlaps または空配列」を1クエリで書くと `or=(team_slugs.ov.{a,b},team_slugs.eq.{})` のような**配列リテラル文字列をデータから組み立てる**ことになり、slug に想定外の文字が混ざった場合の挙動がテストで再現できない。テストは Supabase クライアントをモックするため、シリアライズの誤りを検出できない。

JS 側で判定すれば、判定ロジックがそのまま単体テストの対象になる。

### 件数の前提

この方式は「通知ONの全トークンを取得してから絞る」ため、`expo_push_tokens` の行数に比例する。**現在2行**、ピーク時の試合数は週14件なので負荷は無視できる。`expo_push_tokens` が **5,000 行を超えたら** DB 側フィルタへの差し戻しを再検討すること（本 spec ではやらない）。

### 型

`PushTokenRow` は現在 `token` のみを想定している可能性がある。`team_slugs` を読むため、必要なら同ファイル内の型定義に `team_slugs: string[] | null` を足す。`Database` 型から導出できるならそちらを優先する。

## UI サーフェス

**なし。**

## LLM 連携

**なし。** 通知本文は既存の固定文字列（`buildTitle` / `buildBody`）を使う。

## 受け入れ条件

1. `getTokensForMatch(client, match, "notify_content")` が、`team_slugs = []` かつ `notify_content = true` の行を**返す**。
2. `getTokensForMatch(client, match, "notify_prematch")` が、`team_slugs = []` かつ `notify_prematch = true` の行を**返さない**。
3. `team_slugs = ["japan"]` の行は、match の home / away いずれかが `japan` のとき**両方の column で返る**。
4. `team_slugs = ["ireland"]` の行は、home / away が `japan` と `australia` の match では**どちらの column でも返らない**。
5. `notify_content = false` の行は、`team_slugs` が空でも `"notify_content"` 呼び出しで**返らない**。
6. `team_slugs` が `null` の行は、空配列と同じ扱いになる（content のみ返る）。
7. 上記1〜6を `tests/` 配下の単体テストで検証する。既存の iOS push cron テスト（`tests/api/ios-push-cron.test.ts`）と同じモック方式に合わせること。
8. `pnpm lint`、`pnpm tsc --noEmit`、`pnpm test` がすべて通る。
9. cron ルート（`app/api/cron/send-prematch-notifications/route.ts`、`app/api/cron/send-content-notifications/route.ts`）のレスポンス形状を変更していない。

## やってはいけないこと

- `overlaps` を「空配列も全チーム扱い」に変えないこと。prematch まで配信されると開幕週に1日4通になる（上表）。
- `app/api/v1/push/register/route.ts` の Zod validation で空配列を禁止しないこと。登録自体は通し続ける。
- `tryline-mobile` 側のコードに手を出さないこと。
- Web Push（`app/api/push/send/route.ts`、`push_subscriptions`）に一切変更を加えないこと。別 spec の対象。
- `push_notification_log` のスキーマを変えないこと。

## 未解決の質問

なし。空配列の扱いは Owner 承認済み（2026-08-26）。
