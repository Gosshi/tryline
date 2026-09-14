# 検証記録 — 2026-09-11

対象HEAD: `8bd354e`、比較元: `ce9687e`。作業開始時の `git status --short` は空。今回の追加はこの監査フォルダのみ。

## 安全な実行条件

- 監査用Vitest設定は通常設定を継承し、`envDir: false` で `.env` 読み込みを無効化。
- 既存9/10監査のoffline setupで実fetchを拒否。各テストが必要なDB/API/メール/スクレイパー等をモックする。
- 過去監査の不正挙動を期待するテストは、今回の回帰テストへ混ぜていない。
- 実DB、メール送信、Stripe、LLM、本番cronは実行していない。生成コストなし。
- `.env*`、認証情報、gitignore対象のデータ、他プロジェクトは参照していない。

## 1. 変更に対応する既存テスト

下記のdiffが列挙する31ファイルを、実行時には明示パスで指定した。同じ対象を再現するコマンド:

```sh
git diff --name-only -z ce9687e..8bd354e -- tests | xargs -0 pnpm exec vitest run --config docs/audits/gpt6-followup-2026-09-11/vitest.config.ts
```

結果: **31ファイル283件通過**、12.83秒、skipなし。

対象には5本のスクリプト継続テスト、JRFU拒否保持、ガイド監査、paywall到達、newsletter、preview-window/late-lineups、大会状態・metadata・ブラケット、読了時間、表示整形等を含む。

故障fixtureのconsole.error / warnは想定どおり。match-headerテストで `[csstree-match] BREAK after 15000 iterations` が出たが、テストは通過した。jsdomのCSS処理の出力であり、実ブラウザの描画確認を意味しない。

## 2. 周辺の回帰確認と今回の観測

```sh
pnpm exec vitest run --config docs/audits/gpt6-followup-2026-09-11/vitest.config.ts docs/audits/gpt6-followup-2026-09-11 tests/api/ingest-live-competitions.test.ts tests/ingestion/live-competitions-jrfu-fallback.test.ts tests/ingestion/event-ingestion-identity-guard.test.ts tests/components/paywall.test.tsx tests/components/match-chat.test.tsx --reporter=dot
```

最初の実行時は `jrfu-rejection-regression.test.ts` 追加前。結果は **8ファイル19件通過**、2.15秒。内訳は既存5ファイル16件 + 不正挙動の観測3ファイル3件。

観測テストは期待する正しい動作ではなく、今回見つかった動作を証拠として固定したもの:

- `newsletter-observation.test.ts`: 初回確認成功→同一メールリンクが無効扱い。
- `metadata-observation.test.ts`: 17節不足でも全1試合と説明し、日程に存在するBを落とす。
- `preview-boundary-observation.test.ts`: JST00:00キックオフを24時間早く候補へ含める。

これらがgreenであることを「不具合なし」と扱ってはいけない。通常CIへ追加する場合は正しい期待値の回帰テストへ変更する。

## 3. JRFUの修正後縦断確認

```sh
pnpm exec vitest run --config docs/audits/gpt6-followup-2026-09-11/vitest.config.ts docs/audits/gpt6-followup-2026-09-11/jrfu-rejection-regression.test.ts --reporter=dot
```

結果: **1ファイル1件通過**、0.70秒。9/10の実ルートを通すfixtureを別ファイルへ引き継ぎ、修正後の正しい期待値へ変更した。拒否→後続fetch例外でもHTTP500 / status=failed / matchIdとreason保持を確認。旧ファイルは履歴として無変更。

合計: **既存関連36ファイル299件 + 修正後縦断1件 = 回帰確認300件**。これとは別に不正挙動の観測3件。全体では40ファイル303件だが、通常の全テストスイートではない。

## 4. 通常CIの発見条件

```sh
pnpm exec vitest list --config docs/audits/gpt6-followup-2026-09-10/default-discovery.config.ts tests/ingestion/event-ingestion-validation-cache.test.ts tests/api/fill-event-gaps-rejection-regression.test.ts
```

通常include/excludeを維持し、envロードだけ無効化した設定を使用。次の3件が一覧に出た:

```text
reports a score_mismatch rejection without counting it as filled
reuses paged fixture and signature reads across upsert calls
retries a recovered database after the first snapshot load rejects
```

N5で求めた2ケースが通常テストの対象に入ったことを確認。

## 5. 静的検証

```sh
git diff --name-only -z ce9687e..8bd354e -- app components lib scripts tools | xargs -0 pnpm exec eslint --max-warnings=0
pnpm exec eslint docs/audits/gpt6-followup-2026-09-11 --ext .ts,.tsx --max-warnings=0
git diff --check
```

実装差分39ファイルのESLintはexit0、出力なし。監査用設定の初回lintでanonymous default export警告が1件出たため、名前付き変数にしてから再検証し、exit0を確認した。`git diff --check`もexit0。最終statusは今回の監査フォルダのみ未追跡で、追跡済みファイルに変更はない。

## 未検証

- `pnpm test`の全体、`pnpm typecheck`、`pnpm build`。
- 本番画面・実ブラウザでのviewport到達、モバイル/デスクトップの見た目、CWV。
- マイグレーション適用、本番DB内容、実メール受信、GA4受信、検索反映、Actionsの実行。

標準buildは環境変数ファイル等を読むため、機密/ignoreファイルへのアクセス制約を維持して実行していない。typecheckにもignore対象の生成ファイルが関わる。今回のlintとオフラインテストを、これらの成功の代わりとして報告しない。
