# Nations Championship 2026 診断ログ強化(第2弾)＋ Preview環境での検証を可能にする

## 背景

`fix-nations-championship-vercel-ingestion-silent-zero.md`(PR #595、マージ済み・本番デプロイ済み)で追加した診断ログにより、`nations-championship-2026` のingestionがVercel本番で0件になる件について新たな事実が判明した。

**確認済みの事実**(2026-07-19、本番の実ログで検証済み):

1. マージ後、`gh workflow run` で3回連続 cron を手動実行したが、**いずれも `nations-championship-2026` は `matches_updated: 0`** のまま(合計で通算4回連続の再現)。
2. 新しい診断ログ(`Nations Championship 2026 Wikipedia diagnostics`)により以下が判明:
   - `httpStatus: 200`(推測ではなく確定)
   - `responseUrl` はリダイレクトなしで正規URL(`https://en.wikipedia.org/wiki/2026_Nations_Championship`)
   - `mwHeadingCount: 26` — **ローカルで同時刻に直接取得した際の見出し総数(26)と完全一致**
   - `roundHeadingCount: 0` — にもかかわらず、"Round N"形式と認識できた見出しが0件
   - `lastModified` ヘッダがローカルで直接取得した際と同一の値(同じWikipedia記事revisionのはず)
3. **UA不一致仮説は反証された**: `vercel env pull` で本番の `SCRAPER_USER_AGENT` を取得し、ローカルの `.env.production.local` の値とSHA-256ハッシュで比較したところ**不一致**だったため、Owner が Vercel 側の値をローカルに合わせて修正・再デプロイした。しかし**再デプロイ後も同じ症状が再現**しており、UA不一致は原因ではなかった(あるいは唯一の原因ではなかった)。
4. Wikipediaのレスポンスヘッダに `Vary: Accept-Encoding,X-Subdomain,Cookie,Authorization,User-Agent` があり、User-Agentベースのキャッシュバリアントが存在することは確認済みだが、UAを揃えても再現したため、この`Vary`の存在自体が直接の原因という説明は不十分。
5. `mwHeadingCount` が一致するにもかかわらず `roundHeadingCount` だけが0になる現象は、**見出しの総数は同じだが、"Round N"に一致するはずの見出しのテキスト内容自体が異なる**可能性を示唆している。現在の診断ログは見出しの**件数**のみを記録しており、実際のテキスト内容は記録していないため、これ以上の切り分けができない。

## スコープ

対象:
1. `getHtmlStructureDiagnostics()`(`lib/ingestion/sources/wikipedia-nations-championship.ts`)に、`div.mw-heading` 要素の**実際のテキスト内容の一覧**(短い節タイトルのみ。記事本文ではない)を診断ログに追加する。各要素は数十文字程度の見出し文字列(例: "Round 3" 相当)であり、Wikipediaの記事本文を再配信するものではないため、著作権上の懸念には当たらない
   - 出力形式: `mwHeadingTexts: string[]`(26件程度の短い文字列の配列)のように、0件だった場合のみログに含める
2. `.github/workflows/cron-live-pipeline.yml` の `workflow_dispatch` トリガーに、任意指定可能な `target_url` input を追加する(デフォルトは現行の本番URL `https://tryline-six.vercel.app`)。指定された場合、3ステップの `curl` 先をすべて `target_url` に差し替える。これにより、**本番へのマージ・デプロイを経ずに、PRのPreviewデプロイURLに対して同じcronフローを手動実行して検証できる**ようになる(PreviewとProductionは `SCRAPER_USER_AGENT`・`CRON_SECRET`・Supabase接続情報を共有していることを`vercel env ls`で確認済み)
   - `gh workflow run "Cron — Live Pipeline" --ref main -f target_url=https://<preview-url>.vercel.app` のように使う想定

対象外:
- 実際のパース修正(原因がまだ確定していないため)
- `target_url` を使わない通常のスケジュール実行(`schedule:` トリガー)の挙動変更。デフォルト値で従来通り本番を叩く
- Preview環境専用の env var 分離(現状 Preview と Production で env var を共有している設計自体の変更は本 spec の範囲外)

## データモデル変更

なし。

## API サーフェス

なし。

## LLM 連携

なし。

## 実装方針(提案。詳細実装は Codex 判断)

1. `getHtmlStructureDiagnostics()` の戻り値に `mwHeadingTexts: string[]` を追加し、`$("div.mw-heading")` 全件のテキスト(`normalizeWhitespace($(el).text())`程度の正規化でよい)を配列で返す。`logEmptyWikipediaParse()` から呼ばれる際にこの配列をログに含める(`logMissingSource` の404ケースではHTML自体を取得できていないため対象外でよい)
2. `.github/workflows/cron-live-pipeline.yml` に `workflow_dispatch: inputs: target_url: { description: "対象URL(省略時は本番)", required: false, default: "https://tryline-six.vercel.app" }` を追加し、3つの `curl` ステップの宛先を `${{ github.event.inputs.target_url || 'https://tryline-six.vercel.app' }}/api/cron/...` の形に置き換える

## 受け入れ条件

1. `fetchNationsChampionship2026()` が0件を返すケースで、`console.warn` のログに `mwHeadingTexts`(見出しテキストの配列)が含まれることを確認するテストがある
2. 正常系(1件以上パースできた場合)では引き続き追加ログが出力されないことを確認する既存テストが壊れていない
3. `.github/workflows/cron-live-pipeline.yml` の変更後も、`workflow_dispatch` を引数なしで実行した場合(＝現行のGitHub Actions定時実行と同じ)、従来通り本番URLを叩くことをYAML上のデフォルト値で確認できる(CIでのYAML構文チェック相当。実際の手動実行確認はOwnerが行う)
4. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` が通る
5. `fetchNationsChampionship2026` / `parseNationsChampionshipLiveHtml` の戻り値の型・呼び出し元インターフェースに破壊的変更がない

## 未解決の質問

- `mwHeadingTexts` を見ても "Round N" 形式に見えるテキストが実際にあるのに正規表現がマッチしないのか(表記揺れ・不可視文字等)、それとも "Round" という単語自体が見当たらないテキストなのか(記事構造が根本的に異なる)は、次回の実データを見てから判断する
- `target_url` を使ったPreview環境での検証は、実行そのもの(secretを使ったcurl)はOwner自身が行う想定。Claude Codeは`gh workflow run`経由でこれを実行してよいが、secretの値自体を読み書きしない
