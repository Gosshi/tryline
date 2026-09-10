# 再実行記録

基準: `682a98b..ce9687e`、2026-09-10。

`vitest.config.ts` は通常設定を継承し、envDir=falseと外部fetch拒否setupを追加する。DB等は各テストのモックを使用する。過去の監査ディレクトリ全体をincludeしない。

## 現在の不正挙動の観測

```sh
pnpm exec vitest run --config docs/audits/gpt6-followup-2026-09-10/vitest.config.ts docs/audits/gpt6-followup-2026-09-10 --reporter=dot
```

結果: 4ファイル、5件通過。JRFUの拒否消失、部分集合のcomplete誤判定、非表示親でのpaywall発火、StrictModeの二重発火、スクリプトの先頭拒否時の残試合未処理を再現する。正常動作を期待する回帰テストではない。

## 既存関連テスト

```sh
pnpm exec vitest run --config docs/audits/gpt6-followup-2026-09-10/vitest.config.ts tests/api/fill-event-gaps.test.ts tests/api/fill-league-one-playoff-events.test.ts tests/api/ingest-live-competitions.test.ts tests/api/stripe-webhook-entitlement.test.ts tests/ingestion/event-ingestion-validation-cache.test.ts tests/ingestion/event-ingestion-identity-guard.test.ts tests/ingestion/jrfu-match-event-fallback.test.ts tests/ingestion/live-competitions-jrfu-fallback.test.ts tests/ingestion/six-nations-live.test.ts tests/ingestion/top14-lnr-live.test.ts tests/ingestion/upsert-kickoff-preservation.test.ts tests/scrapers/top14-lnr-results.test.ts tests/scripts/fill-event-gaps-rejection.test.ts tests/scripts/backfill-top14-match-events-rejection.test.ts tests/scripts/backfill-premiership-match-events-rejection.test.ts tests/scripts/backfill-urc-match-events-rejection.test.ts tests/scripts/import-world-rugby-full-rejection.test.ts tests/tools/audit-competition-guide-facts.test.ts tests/tools/audit-published-recap-event-integrity.test.ts tests/llm/notify.test.ts tests/app/pricing-page.test.tsx tests/components/match-chat.test.tsx tests/components/match-content-paywall-view.test.tsx tests/components/paywall.test.tsx tests/components/gtag-load-race.test.tsx docs/audits/gpt6-spec-review-followup-2026-09-08/cache-observation.test.ts docs/audits/gpt6-spec-review-followup-2026-09-08/cron-observation.test.ts --testNamePattern='^(?!.*(writes a quoted CSV|caps unreliable)).*$' --reporter=dot
```

結果: 27ファイル、125件通過、2件skipped、8.71秒。標準の全テスト実行ではない。

## 通常CIの検出条件

```sh
pnpm exec vitest list --config docs/audits/gpt6-followup-2026-09-10/default-discovery.config.ts docs/audits/gpt6-spec-review-followup-2026-09-08/cache-observation.test.ts docs/audits/gpt6-spec-review-followup-2026-09-08/cron-observation.test.ts
```

結果: exit 0、テスト一覧は空。通常include/excludeを維持し、.envの読み込みだけを無効化した。

## 静的検証

`git diff --name-only 682a98b..HEAD -- app components lib scripts tools` に含まれるTS/TSXの35ファイルを明示して `pnpm exec eslint --max-warnings=0` を実行。exit 0、出力なし。

```sh
pnpm exec eslint docs/audits/gpt6-followup-2026-09-10 --ext .ts,.tsx --max-warnings=0
git diff --check
```

監査用TS/TSXのESLintはexit 0。実装コード、仕様書、既存の監査資料は変更していない。
