# Runbook — ライブパイプライン手動実行（マーキー試合の即時 recap）

対象ワークフロー: `.github/workflows/cron-live-pipeline.yml`（`Cron — Live Pipeline`）
仕様: `specs/refactor-cron-live-pipeline.md`

## いつ使うか

決勝・代表戦など、定時 cron（00/06/12/18 UTC = 09/15/21/03 JST の6時間ごと）を待たずに当日中に recap を出したいとき。土曜夜キックオフの欧州試合や、夕方決着の Super Rugby Pacific 決勝など。

通常はパイプラインが6時間ごとに自動実行されるため、**最大でも試合終了から約6時間以内**に recap は出る。手動実行はその待ち時間すら惜しい目玉試合のための即時手段。

## 手順（GitHub UI）

1. リポジトリの **Actions** タブを開く。
2. 左サイドバーで **Cron — Live Pipeline** を選択。
3. 右上の **Run workflow** ボタン → ブランチ `main` を確認 → **Run workflow** を実行。
4. 走り始めたジョブ `pipeline` を開き、3ステップが順に成功するのを確認:
   1. `Ingest live competitions (results + events)` — 結果取り込み・finished 化
   2. `Fill League One playoff events` — League One プレーオフのイベント補完
   3. `Orchestrate (preview/recap generation)` — recap/preview 生成

各ステップは前段の HTTP 完了を待ってから走る（`curl -f`）。3ステップ目の `orchestrate` レスポンス（ログ末尾の JSON）に `recaps.triggered` が出ていれば生成が走った証拠。

## CLI（任意）

```bash
gh workflow run "Cron — Live Pipeline" --ref main
# 進行確認
gh run list --workflow "Cron — Live Pipeline" --limit 1
gh run watch
```

## タイミングのコツ

- 試合終了直後すぐに回すと、Wikipedia のスコアボード/イベント反映が未完で `status=scheduled` のまま拾えないことがある。**終了からおおむね30〜60分待ってから**実行すると確実。
- 1回で finished 化されなかった場合は、数十分後にもう一度 Run workflow すればよい（recap は試合単位キャッシュなので二重生成にはならない。未生成のみ拾う）。

## 失敗時

- `ingest` ステップが失敗（HTTP 5xx）しても、`fill` / `orchestrate` は `if: always()` で続行する。既存データに対して安全（未生成のみ生成）。
- recap が生成されない主因は「対象試合がまだ `status=finished` になっていない」こと。Wikipedia 側の反映を待って再実行する。
- 認証エラー（401）が出る場合は `secrets.CRON_SECRET` の設定を確認（Owner 対応）。

## 関連

- 仕様: `specs/refactor-cron-live-pipeline.md`
- 背景: `docs/next-session-cron-redesign.md`（再設計の経緯）
