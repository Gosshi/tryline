`/specs/fix-nations-championship-vercel-ingestion-silent-zero-round2.md` の仕様を実装してください。

**重要: これも調査フェーズの続きです。実際のパース修正は行わず、診断ログの追加とCIワークフローの拡張のみを行ってください。**

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 前回のPR #595(マージ済み)で追加した診断ログにより、Vercel本番で `nations-championship-2026` が0件になる際、`mwHeadingCount`(div.mw-heading の総数)はローカル取得時と完全に一致する(26件)のに、`roundHeadingCount`("Round N"形式と認識できた見出し数)だけが0件になることが判明した。見出しの総数は同じなのにテキスト内容の判定だけが食い違っているとみられるが、現在のログは件数のみで実際のテキストを記録していないため、これ以上の切り分けができない
- 本番の`SCRAPER_USER_AGENT`をローカルに揃えて再デプロイしても再現し続けており(4回連続)、UA不一致は原因ではなかった

やること(2つ):

### 1. 見出しテキストの診断ログ追加
- `lib/ingestion/sources/wikipedia-nations-championship.ts` の `getHtmlStructureDiagnostics()` に、`div.mw-heading` 全件の実際のテキスト内容を `mwHeadingTexts: string[]` として追加する(`normalizeWhitespace()` で正規化した短い文字列の配列。1件あたり数十文字程度の節タイトルであり、記事本文の引用ではない)
- `logEmptyWikipediaParse()` からこの配列がログに含まれるようにする
- `logMissingSource()`(404ケース)はHTML自体を取得できていないため対象外でよい(既存の`null`のままでよい)

### 2. cronワークフローに target_url オプション追加
- `.github/workflows/cron-live-pipeline.yml` の `workflow_dispatch:` に `inputs.target_url`(任意指定、デフォルト`https://tryline-six.vercel.app`)を追加する
- 3つの `curl` ステップ(Ingest live competitions / Fill League One playoff events / Orchestrate)の宛先を、指定があればそのURLに、無ければ従来通り本番URLになるよう書き換える(`${{ github.event.inputs.target_url || 'https://tryline-six.vercel.app' }}` のような形)
- `schedule:` トリガー(定時実行)では `github.event.inputs` が存在しないため、デフォルト値にフォールバックする実装になっていることを確認する

入出力の例:
- `fetchWithPolicy`をモックし、`div.mw-heading`が2件(いずれも"Round"を含まないテキスト)の空っぽHTMLを返すケース → ログの`mwHeadingTexts`にその2件のテキストがそのまま含まれる
- `gh workflow run "Cron — Live Pipeline" --ref main` (target_url省略) → 従来通り `https://tryline-six.vercel.app` を叩く
- `gh workflow run "Cron — Live Pipeline" --ref main -f target_url=https://preview-xyz.vercel.app` → `https://preview-xyz.vercel.app` を叩く

処理すべきエッジケース:
- 正常系(1件以上パースできた場合)では引き続き追加ログを出さない
- `mwHeadingTexts`は診断目的の短いテキスト一覧であり、HTML本文全体や大きな文字列は含めない(前回specの「生HTML本文をログに出さない」方針は維持。見出しテキストのみは対象外として明示的に許可されている)
- ワークフローYAMLの構文が正しいこと(`actionlint`があれば使う。無ければ目視でYAML構文を確認)

完了の定義:
- specs の受け入れ条件1〜5を満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` clean
- 変更ファイル一覧を報告する(想定: `lib/ingestion/sources/wikipedia-nations-championship.ts`、`tests/ingestion/live-sources.test.ts`、`.github/workflows/cron-live-pipeline.yml`)

要件:
- 「対象外」(実際のパース修正、schedule実行の挙動変更、Preview専用env var分離)は実装しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
