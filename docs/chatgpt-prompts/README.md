# ChatGPT による試合事実の収集

**Owner が ChatGPT に調査させ、結果を Discord から `match_sourced_facts` に入れる運用のプロンプト集。**

背景と適法性の整理は `docs/decisions.md` の **D026**、入力経路の仕様は `specs/feat-discord-research-fact-entry.md`。

## 週3回のスケジュール

**時刻は再生成の走る時刻から逆算しています。締切を過ぎて入れた事実は、DB に入るだけで記事に反映されません。**

| 実行 | プロンプト | 対象 | 入力の締切 | 締切の根拠 |
|---|---|---|---|---|
| **木 18:00** | [thu-preview-facts.md](thu-preview-facts.md) | 木・金・土キックオフ | **木 21:05** | `cron-weekend-preview-refresh`（`5 12 * * 4`） |
| **金 18:00** | [fri-preview-facts.md](fri-preview-facts.md) | 日・月未明キックオフ＋土の更新分 | **金 21:05** | `cron-weekend-preview-refresh`（`5 12 * * 5`） |
| **日 20:00** | [sun-recap-facts.md](sun-recap-facts.md) | 週末に終わった試合 | **月 09:05** | `cron-post-match-recap-refresh` の月曜の回 |
| （任意）月 20:00 | 同上・URL 2本 | 月曜未明の欧州戦 | **火 09:05** | 同・火曜の回。**該当試合がある週だけ** |

**実行を18:00〜20:00に置いているのは、読んで確認して貼る時間を確保するためです。** GitHub Actions の cron は実測で1〜10時間遅れますが、**遅れを当てにしないでください。**

## なぜ締切があるのか

`lib/cron/orchestrate.ts` の `live-pipeline` は、**既存コンテンツがある試合を除外します**（`EXISTING_CONTENT_STATUSES = ["draft","published"]`）。プレビュー窓はキックオフの48〜12時間前で、**一度生成されたら作り直しません。**

**記事を作り直す経路は上の3本のリフレッシュだけです。**

火曜の回（PR #756 でマージ済み）は**手動で事実を入れた試合だけ**を対象にします。**何も入力しなければ0件で何も走りません。**

**レビューの主戦場を日曜夜にしているのは、反映が1日早いからです。** 月曜夜に入れると反映は火曜朝になり、**日本代表戦のようにアクセスのピークが試合直後〜翌日に来る記事では山を過ぎます。** 月曜夜の枠は、日曜20時にまだ終わっていない欧州戦（JST 月曜未明キックオフ）のための保険です。

## 入力した事実は消えません

リフレッシュが `fetch-sourced-facts` を再実行しても、**`entry_method = "manual"` の行は削除対象から除外され**（`lib/llm/sourced-facts/fetch.ts:109`）、**allowlist 外ドメインでも読み取り時に例外扱いされます**（同 `:400`）。**再生成のたびに使われます。**

## 再生成しても通知は増えません

- `lib/llm/pipeline.ts:774` の upsert は既存行を更新し、`discord_notified_at` を書き換えない
- `notify-discord` は `.is("discord_notified_at", null)` で絞る
- push は `push_notification_log` の `match_id:kind` で重複排除する

## 量の目安

**1回あたり10〜12ブロック（＝Discord への送信10〜12回）。** 週3回で30〜36回。

**9/25 に URC 144試合とプレミアシップ90試合が開幕すると、対象試合が週20〜30増えます。** 全部は回りません。**既存の事実が少ない試合に絞ってください。** どの試合が薄いかは Claude が DB から出せます。

## 貼る前に必ず

1. **数字・選手名・負傷の詳細を出典で確認する。** URL が 200 でも記事がその事実を書いている保証はない（D026）
2. **カタカナ表記を Claude に照合させる。** 既存 DB と割れる（マルコム・マークス／マルクス など実例あり）
3. **除外ドメインを避ける。** `planetrugby.com` `rugbypass.com` `world.rugby` `espn.com` `bbc.com` は A型（行為禁止）として除外済み
