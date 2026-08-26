# ニュース記事のリンクを収集して Discord に通知する

## 背景

Owner が海外ラグビーの有益な記事を見つける負担が大きい。実例（2026-08-26）:

> シヤ・コリシの第2テスト出場が決まった。エラスマス HC が先発と主将復帰を明言。第1戦を欠場したハムストリングは「グレード2の損傷」だった

この粒度は報道にしかなく、公式リリースには出ない。現状 Owner が X を常時見ていないと逃す。

### allowlist の拡大では解決できない

2026-08-25〜26 の監査で確定した。

| ドメイン | 塞がっている理由 |
|---|---|
| rnz.co.nz / nzherald.co.nz / stuff.co.nz | robots.txt が **GPTBot・OAI-SearchBot・ChatGPT-User を `Disallow: /`**（一般クローラー `*` は許可） |
| rugbypass.com / planetrugby.com / world.rugby / espn.com / bbc.com 等 | **利用規約が「AI システムの訓練・開発目的」を明示禁止**（`fix-sourced-facts-allowlist-compliance` で除外済み） |

**市場全体が自動取得を閉じている。** allowlist を広げる方向は取れない。

### なぜリンク収集なら成立するのか

規制の対象は「Tryline が自動でサイトへアクセスし、**本文を AI に渡す**こと」である。本 spec の設計では:

- 取得するのは **RSS フィードのみ**。記事ページはクロールしない
- 保存するのは **URL・見出し・日時だけ**。本文は取得も保存もしない
- **記事本文が一度も AI に触れない**
- 記事を読むのは Owner 本人（ブラウザ）。これは誰がやっても自由な行為

RSS はそもそも配信されるために公開されている。RNZ の RSS 条件も「personal use only」で**取得自体は認めており、禁じているのは再配信**である。

> These feeds are for personal use only. No audio or text from these may be posted to a web site, distributed to a third party or broadcast...

Discord ops チャンネルは **Owner 専用**（2026-08-26 確認）なので、個人利用の範囲に収まる。

**この整理は Owner が 2026-08-26 に決定した。**

## スコープ

対象:
- RSS フィードから記事リンクを収集する cron
- DB の対戦カードと突合する機械的フィルタ
- 該当した見出しのみの日本語化
- Discord ops への通知
- 収集結果を保持するテーブル

対象外:
- **記事本文の取得・保存・LLM への投入**（設計の根幹。絶対にやらない）
- **収集した見出し・リンクをサイトに掲載すること**（RNZ の条件で明確に禁止）
- 事実の入力機構（**別 spec**。Discord bot で行う）
- `scripts/import-news-digest-facts.ts` の修正・拡張（**旧 Markdown ダイジェスト経路は routine 停止で役目を終えた**。触らない）
- `lib/llm/sourced-facts/allowlist.ts` の変更
- RSS を持たないサイトの記事一覧巡回（**systematic な巡回は行わない**）

## 対象フィード

初期は以下3つ。**設定として持ち、追加削除しやすくすること。**

**3ドメインとも 2026-08-26 に robots.txt と利用条件を確認済み。実装をブロックする未確認事項は無い。**

| ドメイン | フィード | robots（`*`） | 利用条件 |
|---|---|---|---|
| `rnz.co.nz` | `https://www.rnz.co.nz/rss/sport.xml` | `Allow: /`・**Crawl-delay 7** | 「personal use only」。**取得可・再配信禁止** |
| `nzherald.co.nz` | `https://www.nzherald.co.nz/arc/outboundfeeds/rss/topic/rugby/?outputType=xml&_website=nzh` | RSS パスに制限なし | **自動取得の禁止条項なし。** 見出しとリンクの表示ライセンスを明示付与（後述） |
| `stuff.co.nz` | `https://www.stuff.co.nz/rss?section=/sport/rugby` | RSS パスに制限なし・Crawl-delay なし | フィード内に条件記載なし |

3ドメインとも robots.txt は **GPTBot / OAI-SearchBot / ChatGPT-User のみを `Disallow: /`** とし、一般クローラーには開いている。本設計は本文を LLM に渡さないため、この線引きの内側に収まる。

### NZ Herald のライセンス条項に注意

NZ Herald は RSS について次のライセンスを付与している。

> grants a revocable, nontransferable, nonsublicensable, royalty-free, nonexclusive license to **display on your website the headlines and active links** from the Service **provided you do not alter the headlines and active links**

- 取得を禁じる条項は無い
- ただし**サイトに表示する場合**は「見出しを改変しない」「`news from nzherald.co.nz` と出典表記する」が条件

**本 spec ではサイトに出さないため、このライセンスを行使しない。** ただし将来サイトに掲載する場合、**日本語化した見出しは「改変」にあたり使えない**。この制約を忘れないこと。

取得は既存の `fetchWithPolicy`（`lib/scrapers/fetcher.ts`）を通すこと。robots.txt 判定とレート制限が既に実装されている。**`skipRobotsCheck` は使わない。**

## データモデル変更

新規テーブル `news_links` を追加する。

| カラム | 型 | 用途 |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `source_domain` | text NOT NULL | `rnz.co.nz` 等 |
| `source_url` | text NOT NULL **UNIQUE** | 重複通知の防止 |
| `title` | text NOT NULL | 原文見出し |
| `title_ja` | text NULL | 日本語化した見出し |
| `published_at` | timestamptz NULL | フィードの日時 |
| `matched_match_id` | uuid NULL | 紐付いた試合（FK: `matches.id`） |
| `notified_at` | timestamptz NULL | 通知済みの記録 |
| `created_at` | timestamptz NOT NULL default `now()` | |

**本文を格納するカラムを作らないこと。** 作れば必ず使われる。

**RLS を有効にし、匿名・認証ユーザーからの読み取りを許可しない。** サイトに出さないことが条件のため、公開 API から到達できてはいけない。`feedback_new_table_rls_verification` に「新規テーブルは RLS 状態を本番で直接確認する」という過去の事故記録がある。

## フィルタは機械的に行う

**LLM を使わない。** 今後の試合に出るチーム名で単純に絞る。

- `matches` の `kickoff_at` が今日から14日以内のものを取得
- 各試合の `teams.name` / `teams.english_name` を集める
- 見出しに**いずれかのチーム名が含まれれば**該当とする
- 複数該当した場合は、**キックオフが最も近い試合**に紐付ける

大文字小文字は区別しない。`New Zealand` / `All Blacks` のような通称は、**現時点では `teams` の既存カラムにあるものだけで判定する**。通称辞書の新設は本 spec では行わない（未解決の質問を参照）。

**該当しない記事は通知しない。** DB に保存するかは裁量でよいが、保存する場合も `matched_match_id` は null のままにする。

## 見出しの日本語化

該当した記事の**見出しだけ**を日本語化する。

- 使うモデルは `lib/llm/models.ts` の既存定数から選ぶ。**モデル ID を直書きしない**
- 入力は見出し1行のみ。**本文・要約・その他のフィード内容を渡さない**
- 失敗しても通知は行う（`title_ja` が null のまま原文で通知する）。翻訳失敗で情報が届かない方が損失が大きい

見出しは短いのでコストは小さいが、**フィルタを先に通すこと**で対象をさらに絞る。

## Discord 通知

`DISCORD_WEBHOOK_OPS`（既存）へ送る。既存の実装は `lib/llm/notify.ts` を参照。

1件ずつ、以下を含むメッセージにする。

```
🗞 8/30 南アフリカ × ニュージーランド
コリシ、第2テストで先発・主将復帰へ
https://www.rnz.co.nz/news/sport/1126038/...
```

- **試合の表示**: キックオフ日（JST）とチーム名（日本語）
- **見出し**: `title_ja` があればそれ、無ければ `title`
- **URL**: そのまま

**後続 spec（Discord bot による事実入力）が、この通知メッセージから試合を特定する。** `matched_match_id` を機械的に取り出せる形にしておくこと。表示を汚さない方法（埋め込みの footer など）でよいが、**フォーマットを決めたら spec 2 の前提になるため、PR 本文に確定形を明記すること。**

`notified_at` を記録し、**同じ記事を二度通知しない。**

## 実行タイミング

GitHub Actions の cron とする。`vercel.json` は使わない（**Vercel Cron は GET で呼ぶため。`weekly-digest` が同じ理由で一度も動いていなかった**）。

既存の cron ワークフロー（`.github/workflows/cron-*.yml`）と同じ形式で、`curl -X POST` ＋ `CRON_SECRET` を使う。

頻度は**1日2〜4回**程度から始める。試合直前の情報が重要なので、キックオフ前に厚くする調整は後から行えばよい。

## API サーフェス

`POST /api/cron/collect-news-links` を新設（cron 認証つき）。既存の cron ルートと同じ `assertCronAuthorized` を使う。

## UI サーフェス

**なし。サイトには一切出さない。**

## LLM 連携

見出しの日本語化のみ。パイプラインの4段階には関与しない。

## 受け入れ条件

1. RSS から記事リンクを取得し、`news_links` に保存できる
2. **記事本文を取得しない。** HTTP リクエストがフィード URL に限られることをテストで確認する
3. `fetchWithPolicy` を経由し、`skipRobotsCheck` を使っていない
4. 今後14日以内の試合のチーム名に一致した記事だけが `matched_match_id` を持つ
5. 一致判定に LLM を使っていない
6. 該当した記事の見出しのみが日本語化される。**本文・要約が LLM に渡らない**
7. 日本語化に失敗しても、原文見出しで通知される
8. Discord に通知され、`notified_at` が記録される
9. **同じ `source_url` を二度通知しない**
10. `news_links` の RLS が有効で、匿名・認証ユーザーから読み取れない（**本番で直接確認する**）
11. 通知メッセージから `matched_match_id` を機械的に取り出せる。**確定フォーマットが PR 本文に記載されている**
12. GitHub Actions から `POST` で起動する。`vercel.json` に追加していない
13. `scripts/import-news-digest-facts.ts` と `lib/llm/sourced-facts/allowlist.ts` に差分が無い
14. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

## 未解決の質問

**ドメインの適法性は3件とも 2026-08-26 に確定済み。以下は実装をブロックしない。**

- **将来サイトに掲載する場合の制約。** NZ Herald のライセンスは「見出しを改変しないこと」が条件のため、**日本語化した見出しは掲載に使えない**。RNZ は再配信自体が禁止。本 spec の範囲（Discord のみ）では問題にならないが、掲載を検討する際は必ず読み直すこと
- **チームの通称辞書。** `All Blacks` / `Springboks` / `Wallabies` のような通称は `teams` に無い可能性が高く、見出しがそれらだけを使っていると取りこぼす。本 spec では既存カラムのみで判定し、取りこぼしの実績を見てから辞書の要否を判断する
- **通知頻度。** 1日2〜4回で始めるが、多すぎれば無視され、少なすぎれば間に合わない。実運用で調整する
- **`stuff.co.nz` の RSS はフィード内に要約（summary）を含む。** 保存しないこと自体は spec で決めているが、実装時に誤って取り込まないよう注意する
