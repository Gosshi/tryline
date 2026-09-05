仕様書 `specs/feat-tuesday-recap-refresh.md` を実装してください。**先に全文を読んでください。**

## 何を作るか

レビューの再生成を**火曜 09:05 JST にもう1回**走らせます。ただし**対象は「直近に手動で事実が入った試合」だけ**です。

そのために読み取り専用エンドポイントを1つ新設し、既存ワークフローにスケジュールを1本足します。

## 無条件に全試合を回さないでください

**月曜の実行は対象期間の全試合をループし、1試合ごとに `fetch-sourced-facts` と `generate-content` をフルで叩きます。** 同じことを火曜にすると週次の LLM コストがほぼ倍になります。9/25 に URC とプレミアシップが開幕すると対象は週30試合を超えます。

**Owner が月曜夜に何も入力しなければ、火曜は対象0件で LLM を1回も呼ばない** — これが成立していることが最重要です。

## 触るファイル

| ファイル | 変更 |
|---|---|
| `.github/workflows/cron-post-match-recap-refresh.yml` | 火曜のスケジュールと分岐を追加 |
| （新規）`app/api/cron/matches-with-recent-manual-facts/route.ts` | 読み取り専用 |
| テスト | 下記参照 |

**次のファイルには差分を作らないでください。**

- `app/api/cron/generate-content/`
- `app/api/cron/fetch-sourced-facts/`
- `lib/llm/pipeline.ts`
- `.github/workflows/cron-weekend-preview-refresh.yml`

## 既存コードの読みどころ

### 1. 分岐の書き方は既存のものを踏襲する

**`.github/workflows/cron-weekend-preview-refresh.yml` に、同じ形の分岐が既にあります。** `5 12 * * 4` と `5 12 * * 5` を `github.event.schedule` で分け、`workflow_dispatch` を別扱いしています。**その構造をそのまま真似てください。**

`cron-post-match-recap-refresh.yml` の現行は `workflow_dispatch` か否かの2分岐なので、**3分岐に広げる**ことになります。

**月曜と `workflow_dispatch` の挙動は1文字も変えないでください。**

### 2. ループ本体は共通のまま

`fetch-sourced-facts?match_id=..&content_type=recap&force=true` → `generate-content` の順に叩くステップは、**対象 ID の決め方だけが違う**ので共通のままにしてください。

火曜は**カレンダー API を呼びません。**

### 3. `fetched_at` を入力時刻として使う

`match_sourced_facts` に `created_at` はありません。**`fetched_at` を使います。**

**手動行は自動リフレッシュの削除対象外**なので（`lib/llm/sourced-facts/fetch.ts:109` の `.or("metadata->>entry_method.is.null,metadata->>entry_method.neq.manual")`）、`force=true` で再取得が走っても**手動行の `fetched_at` は入力時のまま**です。自動取得行は毎回更新されますが、`entry_method = 'manual'` の条件で外れます。

### 4. 通知が再発火しないことを壊さない

**現状、再生成しても Discord も push も再通知されません。** 実装を確認済みです。

- `lib/llm/pipeline.ts:774` の upsert は `onConflict: "match_id,content_type,language"` で既存行を更新し、**`discord_notified_at` を payload に含めない**
- `app/api/cron/notify-discord/route.ts` は `.is("discord_notified_at", null)` で絞る
- push は `push_notification_log` の `match_id:kind` で重複排除する

**`discord_notified_at` を書くコードを増やさないでください。** 現在この列を書くのは `notify-discord` だけです。

### 5. 公開済み記事の保護を壊さない

`lib/llm/pipeline.ts:765-772` の `preservedPublished` は、**QA が通らなかったときに公開中の記事を下書きで潰さない**ための分岐です。**PR #589 で入った修正で、過去に公開中のプレビュー2件が消える事故が起きています。**

## テスト

新エンドポイントについて、次を必ず覆ってください。

- `CRON_SECRET` 無し／誤り → 拒否
- `content_type` が不正 → 400
- `hours` が未指定 → 24 が使われる
- `hours` が 0 以下／168 超 → 400
- **`entry_method` が `manual` でない行が混ざらない**
- **`fetched_at` が範囲外の行が混ざらない**
- `content_type=recap` で `finished` 以外の試合が除外される
- `content_type=preview` で `scheduled` 以外の試合が除外される
- 同じ試合に複数の手動事実 → `match_id` は1つ
- 上限超過 → `truncated: true` で先頭のみ

## 完了の定義

1. 仕様書の受け入れ条件23項目をすべて満たす
2. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean
3. PR 本文に次を記載する
   - **1回あたりの最大試合数の定数と値**
   - **火曜の実行が対象0件のときのログ出力**
   - **月曜の実行と `workflow_dispatch` に差分が無いことの説明**

## 判断に迷ったら

**仕様書に矛盾や不足を見つけたら、実装を進めずに質問してください。** 推測で埋めないでください。

ワークフローの `github.event.schedule` の扱いは、**`cron-weekend-preview-refresh.yml` の実装を読んで合わせてください。** 推測で書かないでください。
