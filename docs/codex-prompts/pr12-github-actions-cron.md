# chore: GitHub Actions による Cron スケジューラー設定

## 目的

`vercel.json` ではなく GitHub Actions を使い、既存の `/api/cron/*` ルートを
定期的に呼び出すワークフローを設定する。
アプリケーションコードの変更はなし。`.github/workflows/` への追加のみ。

## 前提

- 各 cron ルートは `Authorization: Bearer $CRON_SECRET` ヘッダーで認証済み
- `CRON_SECRET` は GitHub Repository Secrets に `CRON_SECRET` として登録する（Owner が手動設定）
- 本番 URL: `https://tryline-six.vercel.app`

## 作成するワークフロー

### 1. `.github/workflows/cron-orchestrate.yml`

試合後のコンテンツ生成（プレビュー・recap）とラインアップ取得を担うメインジョブ。
ラグビーの主要試合は土日に集中するため、土日深夜 JST（UTC 15:00）と
平日も毎日 1 回（UTC 12:00）実行する。

```yaml
name: Cron — Orchestrate

on:
  schedule:
    - cron: '0 12 * * *'     # 毎日 JST 21:00
    - cron: '0 15 * * 6,0'   # 土日 JST 00:00（試合終了後）
  workflow_dispatch:

jobs:
  orchestrate:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger orchestrate
        run: |
          curl -f -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://tryline-six.vercel.app/api/cron/orchestrate
```

### 2. `.github/workflows/cron-ingest-fixtures.yml`

今後の試合日程を取り込む。月曜に週 1 回実行。

```yaml
name: Cron — Ingest Fixtures

on:
  schedule:
    - cron: '0 2 * * 1'   # 毎週月曜 JST 11:00
  workflow_dispatch:

jobs:
  ingest-fixtures:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger ingest-fixtures
        run: |
          curl -f -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://tryline-six.vercel.app/api/cron/ingest-fixtures
```

### 3. `.github/workflows/cron-ingest-results.yml`

試合結果を取り込む。土日の試合終了後（UTC 17:00 = JST 02:00）に実行。

```yaml
name: Cron — Ingest Results

on:
  schedule:
    - cron: '0 17 * * 6,0'   # 土日 JST 02:00
  workflow_dispatch:

jobs:
  ingest-results:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger ingest-results
        run: |
          curl -f -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://tryline-six.vercel.app/api/cron/ingest-results
```

## 変更しないこと

- `app/api/cron/` 以下のルートファイル
- `vercel.json`
- アプリケーションコード全般

## 完了条件

- `.github/workflows/cron-orchestrate.yml` が存在すること
- `.github/workflows/cron-ingest-fixtures.yml` が存在すること
- `.github/workflows/cron-ingest-results.yml` が存在すること
- 各ワークフローが `workflow_dispatch` で手動トリガー可能なこと

## ブランチ・PR

- ブランチ: `chore/github-actions-cron`
- PR タイトル: `Chore: add GitHub Actions cron workflows for fixture/result ingestion and content generation`
