# Cron タイミング見直し（League One プレーオフ対応）

## 背景

League One プレーオフが土曜に開催されるが、以下の依存チェーンがスケジュール上で機能していない。

```
ingest-live-competitions（月曜のみ）
  → fill-league-one-playoff-events（日曜のみ）
  → orchestrate（毎日）→ recap 生成
```

土曜試合の場合、`ingest-live-competitions` が月曜まで実行されないため `status=scheduled` のまま。
`fill-league-one-playoff-events` は日曜に実行されるが対象試合が `status=scheduled` でスキップ。
結果: 試合翌週月曜まで recap が生成されない。

## スコープ

**対象:**
- `.github/workflows/cron-ingest-live-competitions.yml`
- `.github/workflows/cron-fill-league-one-playoff-events.yml`

**対象外:** その他の workflow、アプリケーションコード

## 実装詳細

### 1. `ingest-live-competitions` を毎日実行に変更

**変更前:**
```yaml
schedule:
  - cron: "0 2 * * 1"
```

**変更後:**
```yaml
schedule:
  - cron: "0 2 * * *"
```

週1（月曜）→ 毎日 02:00 UTC（JST 11:00）。Premiership・URC・Super Rugby 等の週末試合も翌朝には DB に反映される。

### 2. `fill-league-one-playoff-events` を毎日実行に変更

**変更前:**
```yaml
schedule:
  - cron: "0 8 * * 0"
```

**変更後:**
```yaml
schedule:
  - cron: "0 3 * * *"
```

週1（日曜 08:00）→ 毎日 03:00 UTC（JST 12:00）。`ingest-live-competitions`（02:00）の 1 時間後に実行し、当日 `status=finished` になった試合のイベントを即日補完できる。

## 変更後のフロー（土曜試合の場合）

| 時刻（UTC） | JST | 処理 |
|------------|-----|------|
| 日曜 02:00 | 日曜 11:00 | `ingest-live-competitions` → score更新・status=finished |
| 日曜 03:00 | 日曜 12:00 | `fill-league-one-playoff-events` → events補完 |
| 日曜 12:00 | 日曜 21:00 | `orchestrate` → recap 生成 |

試合翌日の夜には recap が公開される。

## 変更ファイルまとめ

| ファイル | 変更内容 |
|----------|---------|
| `.github/workflows/cron-ingest-live-competitions.yml` | `0 2 * * 1` → `0 2 * * *` |
| `.github/workflows/cron-fill-league-one-playoff-events.yml` | `0 8 * * 0` → `0 3 * * *` |

## 受け入れ条件

1. 土曜試合の翌日曜に `ingest-live-competitions` が実行される
2. その 1 時間後に `fill-league-one-playoff-events` が実行される
3. 既存の手動実行（`workflow_dispatch`）は引き続き機能する