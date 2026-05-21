# PR #97 — 早朝 cron を追加してアジア太平洋帯のプレビューを通知

## 背景

Super Rugby Pacific（キックオフ UTC 04:35〜09:35）や
League One（キックオフ UTC 05:30 前後）の試合プレビューは、
現在の cron スケジュール（13:00 UTC）では実行時点でキックオフ済みになっており、
stale preview としてスキップされ Discord に通知されない。

UTC 03:00（JST 12:00）に cron を追加することで、
アジア太平洋帯のキックオフ前にプレビューを通知できる。

## スコープ

対象:
- `.github/workflows/cron-post-to-x.yml`

対象外:
- アプリケーションコードの変更なし

---

## 変更仕様

`schedule` に `0 3 * * *` を追加する。

```yaml
on:
  schedule:
    - cron: '0 3 * * *'   # 追加: JST 12:00（アジア太平洋プレビュー用）
    - cron: '0 13 * * *'  # 既存: JST 22:00（夕方試合のレビュー・欧州プレビュー用）
    - cron: '0 16 * * 6,0' # 既存: 週末 JST 01:00（週末追加スイープ）
  workflow_dispatch:
```

---

## 完了の定義

- [ ] `.github/workflows/cron-post-to-x.yml` に `0 3 * * *` が追加されている
- [ ] 既存の 2 つのスケジュールは変更されていない
