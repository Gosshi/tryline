# 火曜朝のレビュー再生成（手動入力があった試合だけ）

## 背景

**月曜 09:05 JST の `post-match-recap-refresh` が、週で最後にレビューを再生成する機会です。** これを過ぎると、事実を追加しても記事は変わりません。

`live-pipeline` は既存コンテンツがある試合を除外するため（`lib/cron/orchestrate.ts:5` の `EXISTING_CONTENT_STATUSES = ["draft","published"]`）、**一度生成された記事を作り直す経路はリフレッシュ2本しかありません。**

これで2つの不都合が起きています。

### 1. 月曜夜の調査が反映されない

`docs/chatgpt-prompts/` の運用では、**週末に終わった試合のレビュー素材を月曜夜に集めます。** しかし再生成は月曜 09:05 に終わっているため、**入力した事実は DB に入るだけで誰にも読まれません。**

### 2. 日曜夜の欧州キックオフが構造的に救えない

日曜夜の欧州の試合は **JST で月曜未明**です。実例として 2026-09-06 19:05 UTC のラ・ロシェル×トゥールーズは **JST 月曜 04:05** キックオフで、終了は6時ごろ。

**月曜 09:05 のリフレッシュとほぼ同時なので、事実を入れる隙がありません。** この試合のレビューは調査の恩恵を一切受けられない。

## スコープ

対象:
- `.github/workflows/cron-post-match-recap-refresh.yml` に火曜のスケジュールを追加
- **直近に手動入力があった試合を返す読み取り専用エンドポイントの新設**

対象外:
- **月曜の実行の変更。** 現行の挙動をそのまま維持する
- `app/api/cron/generate-content` と `app/api/cron/fetch-sourced-facts` の変更
- `lib/llm/pipeline.ts` の変更
- プレビュー側（`cron-weekend-preview-refresh.yml`）の変更
- 通知まわりの変更

## 無条件に再生成してはいけない

**月曜の実行は対象期間の全試合をループし、1試合ごとに `fetch-sourced-facts` と `generate-content` をフルで叩きます。** 火曜に同じことをすると、**週次の LLM コストがほぼ倍になります。**

対象は木〜月の全試合で、**9/25 に URC 144試合とプレミアシップ90試合が開幕すると週30試合を超えます。**

**火曜の実行は「直近に手動で事実が入った試合」だけを対象にしてください。**

**Owner が月曜夜に何も入力しなければ、火曜の実行は対象0件で、LLM を1回も呼びません。** これが本 spec の安全性の根拠です。

## API サーフェス

### 新規: `GET /api/cron/matches-with-recent-manual-facts`

既存の cron ルートと同じ `Authorization: Bearer <CRON_SECRET>` で認証する。**読み取り専用。**

| パラメータ | 必須 | 内容 |
|---|---|---|
| `content_type` | 必須 | `preview` または `recap`。それ以外は 400 |
| `hours` | 任意 | 遡る時間。既定 24、上限 168。範囲外は 400 |

**レスポンス**

```json
{ "match_ids": ["..."], "count": 3, "truncated": false }
```

**抽出条件**

1. `match_sourced_facts` から、`content_type` が一致し、**`metadata->>entry_method = 'manual'`** で、**`fetched_at >= now() - hours`** の行を取る
2. `match_id` を重複排除する
3. `matches` と突き合わせ、**`content_type = "recap"` なら `status = "finished"`、`preview` なら `status = "scheduled"`** の試合だけ残す
4. `kickoff_at` の降順に並べ、**上限（定数）で切る**。切ったら `truncated: true`

### なぜ `fetched_at` で判定できるか

`match_sourced_facts` に `created_at` はありません。**`fetched_at` を入力時刻として使います。**

**手動行は自動リフレッシュの削除対象から除外されている**ため（`lib/llm/sourced-facts/fetch.ts:109`）、`fetch-sourced-facts?force=true` が走っても**手動行の `fetched_at` は入力時のまま変わりません。** 自動取得行は毎回更新されますが、`entry_method = 'manual'` の条件で除外されます。

### 上限

**1回あたりの最大試合数を定数として定義してください。推奨値は 30。**

超えた場合も**エラーにせず、`truncated: true` を返して先頭だけ処理する**こと。ワークフローのログに残ればよい。

## ワークフローの変更

`.github/workflows/cron-post-match-recap-refresh.yml` に火曜のスケジュールを追加する。

```
- cron: "5 0 * * 1"   # 既存。月 09:05 JST
- cron: "5 0 * * 2"   # 追加。火 09:05 JST
```

**分岐は `github.event.schedule` で行ってください。** 同じ形が `cron-weekend-preview-refresh.yml` に既にあります（`5 12 * * 4` と `5 12 * * 5` を分けている）。**そちらを踏襲してください。**

| トリガー | 対象の決め方 |
|---|---|
| `5 0 * * 1`（月） | **現行のまま。** カレンダー API から JST で `today-4days`〜`today` の `finished` を取る |
| `5 0 * * 2`（火） | **新エンドポイントに `content_type=recap&hours=24` で問い合わせ、返った `match_ids` を使う** |
| `workflow_dispatch` | **現行のまま。** `from` / `to` の日付指定 |

**火曜の実行はカレンダー API を呼びません。** 対象0件なら、ループに入らずサマリを出して正常終了すること。

`fetch-sourced-facts` と `generate-content` を叩くループ本体は**共通のまま**にしてください。

## データモデル変更

なし。

## UI サーフェス

なし。

## LLM 連携

**新規エンドポイント自体は LLM を呼びません。**

火曜の実行は、対象試合ごとに既存の `fetch-sourced-facts`（事実抽出）と `generate-content`（ナラティブ生成＋QA）を1回ずつ呼びます。**対象0件なら呼び出しは発生しません。**

## 通知は増えません（確認済み）

**再生成しても Discord・push とも再通知されません。** 実装を確認済みで、これを壊さないことが受け入れ条件です。

- `lib/llm/pipeline.ts:774` の upsert は `onConflict: "match_id,content_type,language"` で**既存行を更新**し、**`discord_notified_at` を payload に含めない**ため値が保たれる
- `app/api/cron/notify-discord/route.ts` は `.is("discord_notified_at", null)` で絞る
- push は `push_notification_log` の `match_id:kind` で重複排除する（`lib/push/notifications.ts:128-138`）

**`discord_notified_at` を書くのは `notify-discord` だけ**であることも確認済みです。

## 公開済み記事の保護

**QA が通らなかったときに公開中の記事を下書きで潰さない挙動を壊さないでください。**

`lib/llm/pipeline.ts:765-772` の `preservedPublished` がそれです。**PR #589 で入った修正で、過去に公開中のプレビュー2件が消える事故が起きています。**

## 受け入れ条件

1. 火曜 09:05 JST（`5 0 * * 2`）に `cron-post-match-recap-refresh` が走る
2. **月曜の実行の挙動に差分が無い**（カレンダー API 経由・`today-4days`〜`today`・`finished` のみ）
3. **`workflow_dispatch` の挙動に差分が無い**
4. 分岐が `github.event.schedule` で行われている
5. `GET /api/cron/matches-with-recent-manual-facts` が新設され、**読み取りのみ**である
6. `CRON_SECRET` が無い・誤っているリクエストが拒否される
7. `content_type` が `preview` / `recap` 以外なら 400
8. `hours` が未指定なら 24、168 を超えるか 0 以下なら 400
9. **`metadata->>entry_method = 'manual'` の行だけが対象になる**（自動取得行が混ざらない）
10. **`fetched_at >= now() - hours` で絞られている**
11. `content_type=recap` で `status = "finished"` の試合だけが返る
12. `content_type=preview` で `status = "scheduled"` の試合だけが返る
13. `match_id` が重複しない
14. **1回あたりの最大試合数が定数として定義され、超過時は `truncated: true` で先頭のみ返る**（エラーにしない）
15. 火曜の実行がこのエンドポイントの結果だけを対象にする（**カレンダー API を呼ばない**）
16. **対象0件のとき LLM 呼び出しが1回も発生せず、正常終了する**
17. `fetch-sourced-facts` / `generate-content` を叩くループ本体が月曜と共通
18. `app/api/cron/generate-content` / `app/api/cron/fetch-sourced-facts` / `lib/llm/pipeline.ts` に差分が無い
19. `.github/workflows/cron-weekend-preview-refresh.yml` に差分が無い
20. **`discord_notified_at` を書くコードが増えていない**（`notify-discord` 以外に無いこと）
21. 再生成で push 通知が再送されない
22. 新エンドポイントのテストがある（認証拒否 / 不正な `content_type` / 不正な `hours` / manual 以外の除外 / 時間外の除外 / status 不一致の除外 / 上限超過で `truncated`）
23. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

## Owner 側の作業

**新しい環境変数はありません。** マージしてデプロイすれば火曜から動きます。

**初回の火曜は Actions のログで対象件数を確認してください。** 月曜夜に入力していなければ 0 件が正常です。

## 未解決の質問

- **`hours=24` が妥当か。** 月曜夜（20:00 JST 想定）から火曜 09:05 までは約13時間なので24時間で足りるが、GitHub Actions の cron は実測で1〜10時間遅れる。遅延側は問題ないが、**入力が日曜夜にずれ込んだ場合は取りこぼす。** 運用してから調整する
- **プレビュー側にも同じ仕組みを入れるか。** エンドポイントは `content_type=preview` に対応させるが、**今回はワークフローから使わない。** 木・金のリフレッシュで足りるかを見てから判断する
